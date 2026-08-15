// Corrida única (no expuesta en la UI): trae de la REST API de WooCommerce
// los pedidos que son ANTERIORES a que existiera el webhook en vivo
// (src/app/api/webhooks/woocommerce/route.ts) y por lo tanto nunca quedaron
// en `ventas`/`movimientosContables` — es la contraparte histórica de ese
// webhook, no un reemplazo.
//
// Es SOLO ADITIVO sobre `clientes`: si el cliente del pedido ya existe (match
// por patente, si no por email) esta venta histórica se linkea a él sin
// tocar ningún otro campo — vencimiento/plan/fechaContratacion los sigue
// gobernando el webhook en vivo o un operador, nunca este script. Si el
// cliente no existe todavía, se crea con los datos de ese pedido; su
// vencimiento va a quedar en el pasado (correcto: es la última vez que se
// supo de él, no un cliente vigente hoy).
//
// Idempotente en dos niveles: usa el mismo id de venta que el webhook en
// vivo (wc-<orderId>) para no reprocesar lo que el webhook ya haya cargado,
// y además hace onConflictDoNothing en los inserts — correrlo de nuevo (o
// después de que pasen más pedidos reales) no duplica nada.
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima,
// igual que scripts/backfill-ingresos-contables.ts.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/migrar-historico-woocommerce.ts --dry-run
//   npx tsx --env-file=.env.local scripts/migrar-historico-woocommerce.ts

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clientes, movimientosContables, ventas } from "@/db/schema";
import { PLANES, fmtCLP, formatTelefono, movimientoContableDesdeVenta, normPlate } from "@/lib/helpers";

// NO hardcodear esto: "https://zplash.cl" dejó de servir WordPress/WooCommerce
// desde el corte de dominio del 12-ago-2026 (ver next.config.ts,
// REDIRECTS_LEGACY_WORDPRESS) y a la fecha de este comentario todavía no está
// confirmado a qué URL quedó (la cuenta de hosting es BanaHosting —
// ns8986/ns8987.banahosting.com son los nameservers de zplash.cl — hay que
// entrar a ese panel y confirmar/crear el subdominio correcto). Se pasa por
// env (--env-file=.env.local) para no tener que tocar este archivo cuando se
// confirme.
const ESTADOS_VALIDOS = new Set(["processing", "completed"]);
const CREADO_POR = "Migración histórica WooCommerce";

type OrderWC = {
  id: number;
  status: string;
  date_created: string;
  total: string;
  billing?: Record<string, unknown>;
  meta_data?: Array<{ key?: string; value?: unknown }>;
};

// Misma lógica que extraerPatente en src/app/api/webhooks/woocommerce/shared.ts
// — duplicada a propósito (ver nota de arriba sobre no importar módulos que
// arrastran "server-only").
function extraerPatente(order: OrderWC): string {
  const candidatos: string[] = [];
  const billing = order.billing || {};
  for (const [k, v] of Object.entries(billing)) {
    if (typeof v === "string" && /patente/i.test(k)) candidatos.push(v);
  }
  if (Array.isArray(order.meta_data)) {
    for (const m of order.meta_data) {
      if (m && typeof m.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") {
        candidatos.push(m.value);
      }
    }
  }
  return normPlate(candidatos.find((c) => c && c.trim()) || "");
}

function addDaysISO(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

async function fetchTodosLosPedidos(siteUrl: string, consumerKey: string, consumerSecret: string): Promise<OrderWC[]> {
  const auth = "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const pedidos: OrderWC[] = [];

  do {
    const url = `${siteUrl}/wp-json/wc/v3/orders?per_page=${perPage}&page=${page}&orderby=date&order=asc`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`WooCommerce API ${res.status} en página ${page}: ${await res.text()}`);
    totalPages = Number(res.headers.get("X-WP-TotalPages")) || 1;
    const lote = (await res.json()) as OrderWC[];
    pedidos.push(...lote);
    console.log(`Página ${page}/${totalPages} (${lote.length} pedidos)`);
    page++;
  } while (page <= totalPages);

  return pedidos;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.DATABASE_URL;
  const siteUrl = process.env.WOOCOMMERCE_SITE_URL;
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!dbUrl) throw new Error("Falta DATABASE_URL en las variables de entorno");
  if (!siteUrl) throw new Error("Falta WOOCOMMERCE_SITE_URL (URL actual del WordPress/WooCommerce — ya no es zplash.cl, ver comentario arriba)");
  if (!ck || !cs) throw new Error("Faltan WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET");

  const client = postgres(dbUrl, { prepare: false, max: 5 });
  const db = drizzle(client);

  console.log("Trayendo pedidos de WooCommerce...");
  const pedidos = await fetchTodosLosPedidos(siteUrl, ck, cs);
  console.log(`Total pedidos en WooCommerce: ${pedidos.length}`);

  const [clientesExistentes, ventasExistentesRows] = await Promise.all([
    db.select().from(clientes),
    db.select({ id: ventas.id }).from(ventas),
  ]);
  const ventaIdsExistentes = new Set(ventasExistentesRows.map((v) => v.id));

  // Índices en memoria para no pegarle a la base por cada pedido, y para que
  // dos pedidos históricos del mismo cliente (dentro de esta misma corrida)
  // no generen dos clientes duplicados.
  const porPatente = new Map(clientesExistentes.map((c) => [c.patente, c]));
  const porEmail = new Map(clientesExistentes.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));

  const nuevosClientes: (typeof clientes.$inferInsert)[] = [];
  const nuevasVentas: (typeof ventas.$inferInsert)[] = [];
  const nuevosMovimientos: (typeof movimientosContables.$inferInsert)[] = [];

  let yaProcesados = 0;
  let ignoradosPorEstado = 0;

  for (const order of pedidos) {
    const ventaId = "wc-" + order.id;
    if (ventaIdsExistentes.has(ventaId)) {
      yaProcesados++;
      continue;
    }
    if (!ESTADOS_VALIDOS.has(order.status)) {
      ignoradosPorEstado++;
      continue;
    }

    const billing = order.billing || {};
    const patente = extraerPatente(order);
    const email = String(billing.email || "").trim().toLowerCase();
    const nombre = `${billing.first_name || ""} ${billing.last_name || ""}`.trim().toUpperCase() || "SIN NOMBRE";
    const telefono = formatTelefono(String(billing.phone || ""));
    const fechaOrden = order.date_created ? new Date(order.date_created).toISOString() : new Date().toISOString();
    const monto = Number(order.total) || 0;

    let cliente = (patente && porPatente.get(patente)) || (email && porEmail.get(email)) || undefined;
    const esClienteNuevo = !cliente;

    if (!cliente) {
      const clienteId = "c-wc-" + order.id;
      const nuevoCliente: typeof clientes.$inferInsert = {
        id: clienteId,
        nombre,
        patente: patente || `SIN-PATENTE-${order.id}`,
        telefono: telefono || null,
        email: email || null,
        plan: PLANES[0],
        vencimiento: addDaysISO(fechaOrden, 30),
        fechaContratacion: fechaOrden,
        origen: "WEB",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: CREADO_POR,
      };
      nuevosClientes.push(nuevoCliente);
      cliente = nuevoCliente as unknown as typeof clientes.$inferSelect;
      if (patente) porPatente.set(patente, cliente);
      if (email) porEmail.set(email, cliente);
    }

    const tipoVenta = esClienteNuevo ? "Plan nuevo (Web)" : "Renovación (Web)";
    const ventaData: typeof ventas.$inferInsert = {
      id: ventaId,
      clienteId: cliente.id,
      patente: patente || "",
      nombre,
      plan: PLANES[0],
      precio: monto,
      tipo: tipoVenta,
      fecha: fechaOrden,
      creadoPor: CREADO_POR,
      metodoPago: "tarjeta",
      esServicioAdicional: false,
    };
    nuevasVentas.push(ventaData);

    const movimiento = movimientoContableDesdeVenta({
      id: ventaId,
      tipo: tipoVenta,
      precio: monto,
      fecha: fechaOrden,
      patente: patente || "",
      nombre,
      metodoPago: "tarjeta",
      creadoPor: CREADO_POR,
    });
    if (movimiento) {
      nuevosMovimientos.push({
        id: movimiento.id,
        tipo: movimiento.tipo,
        fecha: movimiento.fecha,
        descripcion: movimiento.descripcion,
        categoria: movimiento.categoria || null,
        contraparte: movimiento.contraparte || null,
        monto: movimiento.monto || 0,
        estado: movimiento.estado,
        metodoPago: movimiento.metodoPago || null,
        creadoEn: movimiento.creadoEn,
        creadoPor: movimiento.creadoPor || null,
        ventaId: movimiento.ventaId || null,
      });
    }
  }

  const totalMonto = nuevasVentas.reduce((s, v) => s + (Number(v.precio) || 0), 0);
  console.log("");
  console.log(`Ya en la base (wc-<id> ya existe): ${yaProcesados}`);
  console.log(`Ignorados por estado (no processing/completed): ${ignoradosPorEstado}`);
  console.log(`Clientes nuevos a crear: ${nuevosClientes.length}`);
  console.log(`Ventas históricas a agregar: ${nuevasVentas.length}`);
  console.log(`Movimientos contables a agregar: ${nuevosMovimientos.length}`);
  console.log(`Monto bruto total a agregar: ${fmtCLP(totalMonto)}`);

  if (dryRun) {
    console.log("");
    console.log("--dry-run: no se escribió nada.");
    await client.end();
    return;
  }
  if (!nuevasVentas.length) {
    console.log("Nada que hacer.");
    await client.end();
    return;
  }

  const LOTE = 200;

  // Primero clientes (ventas.clienteId los referencia), después ventas
  // (movimientosContables.ventaId las referencia), después movimientos.
  for (let i = 0; i < nuevosClientes.length; i += LOTE) {
    const lote = nuevosClientes.slice(i, i + LOTE);
    await db.insert(clientes).values(lote).onConflictDoNothing({ target: clientes.id });
    console.log(`clientes: guardado lote ${Math.floor(i / LOTE) + 1} (${lote.length} filas)`);
  }
  for (let i = 0; i < nuevasVentas.length; i += LOTE) {
    const lote = nuevasVentas.slice(i, i + LOTE);
    await db.insert(ventas).values(lote).onConflictDoNothing({ target: ventas.id });
    console.log(`ventas: guardado lote ${Math.floor(i / LOTE) + 1} (${lote.length} filas)`);
  }
  for (let i = 0; i < nuevosMovimientos.length; i += LOTE) {
    const lote = nuevosMovimientos.slice(i, i + LOTE);
    await db.insert(movimientosContables).values(lote).onConflictDoNothing({ target: movimientosContables.id });
    console.log(`movimientosContables: guardado lote ${Math.floor(i / LOTE) + 1} (${lote.length} filas)`);
  }

  console.log("Listo.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
