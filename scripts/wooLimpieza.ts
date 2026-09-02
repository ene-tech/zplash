// Clasificacion compartida de las suscripciones vivas de WooCommerce, usada
// por scripts/diag-woo-limpieza.mts (reporte) y por el script que da de baja.
// Vive aparte a proposito: el script que ESCRIBE la recalcula en el momento en
// vez de leer un CSV generado antes, para no poder cancelar sobre datos viejos.
//
// Ver el encabezado de diag-woo-limpieza.mts para que significa cada veredicto.
import postgres from "postgres";
import { periodoPlan } from "@/lib/helpers/clientes";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY } from "@/lib/helpers/precios";

export const DIAS_GRACIA = 3;
export const VEREDICTOS_A_CANCELAR = ["TOPE", "MIGRADO", "RENOVO LOCAL", "MUY VENCIDO", "DUPLICADA"];
export const ORDEN = [...VEREDICTOS_A_CANCELAR, "SIN FICHA", "MANTENER"];

export type Fila = {
  v: string;
  motivo: string;
  s: { id: number; estado: string; patente: string; email: string; monto: number; prox: string };
  c: any;
  pasadas: number | string;
  venc: string;
  pagos: string[];
};

export async function clasificar(): Promise<Fila[]> {
  // Solo se le cobra la renovacion al que sigue vigente o se le vencio recien:
  // destrabar el lock no puede cobrarle un mes retroactivo a quien lleva
  // semanas sin servicio.
  const DIAS_GRACIA = 3;
  const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const site = process.env.WOOCOMMERCE_SITE_URL!;
  const auth = "Basic " + Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString("base64");
  
  async function woo(path: string) {
    const out: any[] = [];
    let p = 1, tp = 1;
    do {
      const r = await fetch(`${site}${path}&per_page=100&page=${p}`, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`WooCommerce ${r.status}: ${(await r.text()).slice(0, 200)}`);
      tp = Number(r.headers.get("x-wp-totalpages")) || 1;
      out.push(...(await r.json()));
      p++;
    } while (p <= tp);
    return out;
  }
  function patenteDe(s: any): string {
    const c: string[] = [];
    for (const [k, v] of Object.entries(s.billing || {})) if (typeof v === "string" && /patente/i.test(k)) c.push(v);
    for (const m of s.meta_data || []) if (typeof m?.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") c.push(m.value);
    return norm(c.find((x) => x && x.trim()) || "");
  }
  
  const subs: any[] = [];
  for (const estado of ["active", "on-hold"]) {
    for (const s of await woo(`/wp-json/wc/v3/subscriptions?status=${estado}&`)) {
      subs.push({ id: s.id, estado, patente: patenteDe(s), email: String(s.billing?.email || "").trim().toLowerCase(),
                  monto: Number(s.total) || 0, prox: (s.next_payment_date_gmt || "").slice(0, 10) });
    }
  }
  
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const { cl, ing, oc, ven } = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return {
      cl: await tx.unsafe(`select id, patente, lower(email) email, nombre, telefono, plan, ilimitado_hasta,
                                  fecha_contratacion, vencimiento, suscripcion_cancelada_en from clientes`),
      ing: await tx.unsafe(`select cliente_id, fecha from ingresos where fecha > now() - interval '8 months'`),
      oc: await tx.unsafe(`select patente from suscripciones_oneclick where estado = 'activa'`),
      // Ventas de plan por canal NO-Woo: prueban que el periodo ya se pago aca.
      ven: await tx.unsafe(`select cliente_id, patente, tipo, fecha, precio from ventas
                            where fecha > now() - interval '70 days' and precio >= 10000
                              and (tipo ilike '%plan%' or tipo ilike '%renov%' or tipo ilike '%reactiv%' or tipo ilike '%upgrade%')
                              and id not like 'wc-%'`),
    } as any;
  });
  await sql.end();
  
  const porPat = new Map<string, any>(), porMail = new Map<string, any>();
  for (const c of cl as any[]) { porPat.set(norm(c.patente), c); if (c.email) porMail.set(c.email, c); }
  const pasadasDe = new Map<string, Date[]>();
  for (const i of ing as any[]) if (i.cliente_id) pasadasDe.set(i.cliente_id, [...(pasadasDe.get(i.cliente_id) || []), new Date(i.fecha)]);
  const conOneclick = new Set((oc as any[]).map((r) => norm(r.patente)));
  const ventasDe = new Map<string, any[]>();
  for (const v of ven as any[]) for (const k of [v.cliente_id && "id:" + v.cliente_id, v.patente && "pat:" + norm(v.patente)].filter(Boolean))
    ventasDe.set(k as string, [...(ventasDe.get(k as string) || []), v]);
  
  const hoy = new Date();
  const filas = subs.map((s) => {
    // La suscripcion de WooCommerce puede traer una patente VIEJA: el cliente la
  // cambio de nuestro lado y alla quedo la anterior (3 casos reales al 2-sep:
  // FGVT23->HSXR40, KHFS61->JDFK85, SFLG13->LBKT23). Peor: esa patente vieja
  // suele existir igual en `clientes`, como ficha de meson sin plan, asi que el
  // match por patente devuelve la ficha equivocada y la suscripcion parece
  // "sin vencimiento". Cuando la ficha de la patente no tiene plan ni
  // vencimiento pero el email resuelve a una que si, gana el email.
  const porPatente = s.patente ? porPat.get(s.patente) : undefined;
  const porCorreo = s.email ? porMail.get(s.email) : undefined;
  const fichaVacia = (x: any) => !x || (!x.plan && !x.vencimiento);
  const c = fichaVacia(porPatente) && !fichaVacia(porCorreo) ? porCorreo : porPatente || porCorreo;
    if (!c) return { v: "SIN FICHA", motivo: "no calza patente ni email con clientes", s, c: null, pasadas: "-" as any, venc: "", pagos: [] as string[] };
    const { inicio, fin } = periodoPlan({ fechaContratacion: c.fecha_contratacion, vencimiento: c.vencimiento } as any);
    const pasadas = (pasadasDe.get(c.id) || []).filter((f) => f >= inicio && f < fin).length;
    const venc = c.vencimiento ? new Date(c.vencimiento) : null;
    const vigente = !!venc && venc >= hoy;
    const diasVencido = venc ? Math.floor((hoy.getTime() - venc.getTime()) / 86_400_000) : null;
    const cobrable = diasVencido !== null && diasVencido <= DIAS_GRACIA;
    const pagos = [...(ventasDe.get("id:" + c.id) || []), ...(ventasDe.get("pat:" + norm(c.patente)) || [])]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((v) => `${new Date(v.fecha).toISOString().slice(0, 10)} ${v.tipo} ${Math.round(Number(v.precio))}`);
    const legacy = c.plan === PLAN_ILIMITADO_LEGACY;
    const base = { s, c, pasadas, venc: venc ? venc.toISOString().slice(0, 10) : "", pagos };
    if (legacy && pasadas > PASES_INCLUIDOS_X5) return { v: "TOPE", motivo: `${pasadas} pasadas en el ciclo desde ${inicio.toISOString().slice(0, 10)}`, ...base };
    if (conOneclick.has(norm(c.patente))) return { v: "MIGRADO", motivo: "Oneclick propio activo", ...base };
    if (vigente && pagos.length) return { v: "RENOVO LOCAL", motivo: pagos[pagos.length - 1], ...base };
    if (!cobrable) return { v: "MUY VENCIDO", motivo: diasVencido === null ? "sin vencimiento en la ficha" : `vencido hace ${diasVencido} dias`, ...base };
    return { v: "MANTENER", motivo: legacy ? `${pasadas} pasadas (<=${PASES_INCLUIDOS_X5})` : `plan ${c.plan || "(sin plan)"}, ${pasadas} pasadas`, ...base };
  });
  
  // Una patente con dos suscripciones vivas se cobraria dos veces el mismo mes,
  // y no hay forma de saber desde aca cual de las dos es "la buena": no se le
  // cobra ninguna, se dan de baja las dos y queda para revisar a mano.
  const vivasPorPatente = filas.reduce<Record<string, number>>((a, f) => {
    const k = f.s.patente || f.c?.patente || "?";
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});
  for (const f of filas) {
    const k = f.s.patente || f.c?.patente || "?";
    if (vivasPorPatente[k] > 1) {
      f.motivo = `${vivasPorPatente[k]} suscripciones vivas para la misma patente (antes: ${f.v})`;
      f.v = "DUPLICADA";
    }
  }
  return filas as Fila[];
}
