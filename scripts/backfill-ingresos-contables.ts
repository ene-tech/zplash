// Corrida única (no expuesta en la UI): genera el MovimientoContable de
// ingreso que le falta a cada Venta ya registrada, para que el EERR de
// meses pasados (ej. julio 2026) deje de mostrar $0 solo porque nadie las
// volvió a tipear a mano en Contabilidad → Ingresos. De acá en adelante esto
// ya se genera solo (ver movimientoContableDesdeVenta en src/lib/helpers.ts
// y sus llamadas en AppContext.commit()/pagos.ts/webhook de WooCommerce) —
// este script solo pone al día lo histórico.
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima.
//
// Uso: npx tsx --env-file=.env.local scripts/backfill-ingresos-contables.ts
//      npx tsx --env-file=.env.local scripts/backfill-ingresos-contables.ts --dry-run

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { movimientosContables, ventas } from "@/db/schema";
import { fmtCLP, movimientoContableDesdeVenta } from "@/lib/helpers";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);

  const ventasRows = await db.select().from(ventas);
  const movimientosRows = await db.select({ id: movimientosContables.id }).from(movimientosContables);
  const existentes = new Set(movimientosRows.map((m) => m.id));

  const faltantes = ventasRows
    .map((v) =>
      movimientoContableDesdeVenta({
        id: v.id,
        tipo: v.tipo,
        precio: v.precio,
        fecha: v.fecha,
        patente: v.patente,
        nombre: v.nombre,
        metodoPago: v.metodoPago,
        estadoPago: v.estadoPago,
        creadoPor: v.creadoPor,
      })
    )
    // null = venta en $0 (cupón de 100%), no genera movimiento: no hay
    // ingreso real que respaldar en Contabilidad.
    .filter((m): m is NonNullable<typeof m> => m !== null)
    // No pisar nada que ya exista (ej. si esa venta ya se había cargado a
    // mano con otro id de movimiento, o si el script ya corrió antes).
    .filter((m) => !existentes.has(m.id));

  const total = faltantes.reduce((s, m) => s + m.monto, 0);
  console.log(`Ventas totales: ${ventasRows.length}`);
  console.log(`Movimientos contables a crear: ${faltantes.length}`);
  console.log(`Monto bruto total a agregar: ${fmtCLP(total)} (neto ~${fmtCLP(total / 1.19)})`);

  if (dryRun) {
    console.log("--dry-run: no se escribió nada.");
    await client.end();
    return;
  }
  if (!faltantes.length) {
    console.log("Nada que hacer.");
    await client.end();
    return;
  }

  const rows = faltantes.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    descripcion: m.descripcion,
    categoria: m.categoria || null,
    contraparte: m.contraparte || null,
    monto: m.monto || 0,
    estado: m.estado,
    metodoPago: m.metodoPago || null,
    creadoEn: m.creadoEn,
    creadoPor: m.creadoPor || null,
    ventaId: m.ventaId || null,
  }));

  const LOTE = 200;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    await db.insert(movimientosContables).values(lote).onConflictDoNothing({ target: movimientosContables.id });
    console.log(`Guardado lote ${Math.floor(i / LOTE) + 1}: ${lote.length} movimientos`);
  }
  console.log("Listo.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
