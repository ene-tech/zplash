// SOLO LECTURA: la lista de rescate de la politica "≤5 pasadas se mantiene".
//
// Cruza las suscripciones VIVAS de WooCommerce (active + on-hold) contra
// nuestra base y cuenta las pasadas del ciclo de plan EN CURSO de cada uno
// (periodoPlan, anclado a fechaContratacion) — el mismo contador que mira
// superoTopeIlimitado para decidir si al cliente se le termina el ilimitado.
//
// Veredicto por cliente:
//   MANTENER  -> ≤5 pasadas en el ciclo vigente: se le conserva el ilimitado
//                viejo y se le sigue cobrando por Woo (planResultante en
//                /api/webhooks/woocommerce).
//   CORTAR    -> ya lleva 6 o mas: le corresponde el aviso de fin de plan +
//                la oferta del X5 (evaluarReglasCorreoPorTopeIlimitado).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-woo-rescate-lista.mts
//      npx tsx --env-file=.env.local scripts/tmp-woo-rescate-lista.mts --csv > rescate.csv
import postgres from "postgres";
import { periodoPlan } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5 } from "@/lib/helpers/precios";

const csv = process.argv.includes("--csv");
const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function auth(): string {
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!ck || !cs) throw new Error("Faltan WOOCOMMERCE_CONSUMER_KEY/SECRET");
  return "Basic " + Buffer.from(`${ck}:${cs}`).toString("base64");
}

// Misma extraccion de patente que /api/webhooks/woocommerce/shared.ts y
// cancelarSuscripcionWooCommerceLegacy: billing.* o meta_data con "patente".
function patenteDe(sub: Record<string, any>): string {
  const cand: string[] = [];
  for (const [k, v] of Object.entries(sub.billing || {})) {
    if (typeof v === "string" && /patente/i.test(k)) cand.push(v);
  }
  for (const m of sub.meta_data || []) {
    if (m?.key && /patente/i.test(m.key) && typeof m.value === "string") cand.push(m.value);
  }
  return norm(cand.find((c) => c && c.trim()) || "");
}

async function suscripcionesVivas() {
  const site = process.env.WOOCOMMERCE_SITE_URL;
  if (!site) throw new Error("Falta WOOCOMMERCE_SITE_URL");
  const subs: { id: number; estado: string; patente: string; email: string; monto: number; proximoCobro: string | null }[] = [];
  for (const estado of ["active", "on-hold"]) {
    let page = 1;
    let paginas = 1;
    do {
      const url = `${site}/wp-json/wc/v3/subscriptions?per_page=100&page=${page}&status=${estado}`;
      const res = await fetch(url, { headers: { Authorization: auth() } });
      if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${(await res.text()).slice(0, 200)}`);
      paginas = Number(res.headers.get("x-wp-totalpages")) || 1;
      for (const s of (await res.json()) as Record<string, any>[]) {
        subs.push({
          id: s.id,
          estado,
          patente: patenteDe(s),
          email: String(s.billing?.email || "").trim().toLowerCase(),
          monto: Number(s.total) || 0,
          proximoCobro: s.next_payment_date_gmt || null,
        });
      }
      page++;
    } while (page <= paginas);
  }
  return subs;
}

const subs = await suscripcionesVivas();

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const { clientes, ingresos } = await sql.begin(async (tx) => {
  await tx.unsafe("set transaction read only");
  const clientes = await tx.unsafe(`
    select id, patente, nombre, email, telefono, plan, ilimitado_hasta, fecha_contratacion,
           vencimiento, precio_plan_heredado
    from clientes`);
  // 8 meses cubre de sobra cualquier ciclo en curso, incluso el de una
  // renovacion anticipada apilada.
  const ingresos = await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '8 months'`);
  return { clientes, ingresos } as any;
});
await sql.end();

const porPatente = new Map<string, any>();
const porEmail = new Map<string, any>();
for (const c of clientes) {
  porPatente.set(norm(c.patente), c);
  if (c.email) porEmail.set(String(c.email).trim().toLowerCase(), c);
}
const pasadasDe = new Map<string, Date[]>();
for (const i of ingresos) {
  if (!i.cliente_id) continue;
  const arr = pasadasDe.get(i.cliente_id) || [];
  arr.push(new Date(i.fecha));
  pasadasDe.set(i.cliente_id, arr);
}

type Fila = {
  veredicto: string;
  patente: string;
  nombre: string;
  email: string;
  telefono: string;
  plan: string;
  vencimiento: string;
  pasadasCiclo: number | string;
  cicloDesde: string;
  subEstado: string;
  subMonto: number;
  subProximoCobro: string;
  subId: number;
};

const filas: Fila[] = [];
for (const s of subs) {
  const c = (s.patente && porPatente.get(s.patente)) || (s.email && porEmail.get(s.email));
  if (!c) {
    filas.push({
      veredicto: "SIN FICHA",
      patente: s.patente,
      nombre: "",
      email: s.email,
      telefono: "",
      plan: "",
      vencimiento: "",
      pasadasCiclo: "-",
      cicloDesde: "",
      subEstado: s.estado,
      subMonto: s.monto,
      subProximoCobro: (s.proximoCobro || "").slice(0, 10),
      subId: s.id,
    });
    continue;
  }
  const cliente = { fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento };
  const { inicio, fin } = periodoPlan(cliente as any);
  const pasadas = (pasadasDe.get(c.id) || []).filter((f) => f >= inicio && f < fin).length;
  filas.push({
    veredicto: pasadas > PASES_INCLUIDOS_X5 ? "CORTAR Y OFRECER X5" : "MANTENER",
    patente: c.patente,
    nombre: c.nombre,
    email: c.email || "",
    telefono: c.telefono || "",
    plan: c.plan || "",
    vencimiento: c.vencimiento ? new Date(c.vencimiento).toISOString().slice(0, 10) : "",
    pasadasCiclo: pasadas,
    cicloDesde: inicio.toISOString().slice(0, 10),
    subEstado: s.estado,
    subMonto: s.monto,
    subProximoCobro: (s.proximoCobro || "").slice(0, 10),
    subId: s.id,
  });
}

filas.sort((a, b) => a.veredicto.localeCompare(b.veredicto) || Number(b.pasadasCiclo) - Number(a.pasadasCiclo));

if (csv) {
  const cols = Object.keys(filas[0]);
  console.log("﻿" + cols.join(";"));
  for (const f of filas) console.log(cols.map((k) => String((f as any)[k]).replace(/;/g, ",")).join(";"));
} else {
  const resumen: Record<string, { n: number; monto: number }> = {};
  for (const f of filas) {
    const r = (resumen[f.veredicto] ||= { n: 0, monto: 0 });
    r.n++;
    r.monto += f.subMonto;
  }
  console.log("\n=== Suscripciones vivas en WooCommerce: " + subs.length + " ===\n");
  console.table(resumen);
  const dist: Record<string, number> = {};
  for (const f of filas) {
    if (f.pasadasCiclo === "-") continue;
    const k = String(f.pasadasCiclo).padStart(2, "0") + " pasadas";
    dist[k] = (dist[k] || 0) + 1;
  }
  console.log("\nDistribucion de pasadas del ciclo en curso:");
  console.table(dist);
  console.log("\nLos que ya se pasaron del tope:");
  console.table(
    filas
      .filter((f) => f.veredicto === "CORTAR Y OFRECER X5")
      .map((f) => ({ patente: f.patente, nombre: f.nombre, pasadas: f.pasadasCiclo, ciclo_desde: f.cicloDesde, vence: f.vencimiento, sub: f.subEstado, sub_id: f.subId }))
  );
}
