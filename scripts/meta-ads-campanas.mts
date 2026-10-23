// Baja de la API de Marketing de Meta todas las campañas de anuncios
// (Facebook/Instagram) de la cuenta publicitaria, con su gasto y resultados
// por día. Solo LEE: no crea ni toca campañas.
//
// Uso: npx tsx --env-file=.env.local scripts/meta-ads-campanas.mts
//      npx tsx --env-file=.env.local scripts/meta-ads-campanas.mts --desde 2026-07-01 --hasta 2026-10-19
//
// Sin --desde/--hasta trae toda la historia de la cuenta. Deja en scripts/meta-ads/:
//  - campanas.csv  una fila por campaña (estado, objetivo, fechas, presupuesto, totales)
//  - diario.csv    una fila por campaña y día (gasto, alcance, clics, resultados)
//  - crudo.json    las respuestas de Meta tal cual, por si falta alguna columna
//
// Necesita en .env.local (distintos del token de WhatsApp, que no lee anuncios):
//  - META_ADS_TOKEN       token de usuario del sistema con permiso ads_read
//  - META_ADS_ACCOUNT_ID  id de la cuenta publicitaria, con o sin "act_"
//
// Los montos vienen en la moneda de la cuenta. En CLP los presupuestos
// (daily_budget/lifetime_budget) ya están en pesos: el peso no tiene centavos.
import { mkdirSync, writeFileSync } from "node:fs";

const API = "https://graph.facebook.com/v25.0";
const token = process.env.META_ADS_TOKEN;
const cuentaRaw = process.env.META_ADS_ACCOUNT_ID;
if (!token || !cuentaRaw) {
  console.error("Falta META_ADS_TOKEN o META_ADS_ACCOUNT_ID en .env.local");
  process.exit(1);
}
// Los valores de ejemplo de las instrucciones, pegados tal cual.
if (/^(act_)?(123456789|1234567890123456)$/.test(cuentaRaw) || /^EAAx+$|el_token/.test(token)) {
  console.error("META_ADS_ACCOUNT_ID o META_ADS_TOKEN tienen todavía el valor de ejemplo: reemplázalos por los reales en .env.local");
  process.exit(1);
}
const cuenta = cuentaRaw.startsWith("act_") ? cuentaRaw : `act_${cuentaRaw}`;

const arg = (nombre: string) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const desde = arg("--desde");
const hasta = arg("--hasta");
if (Boolean(desde) !== Boolean(hasta)) {
  console.error("--desde y --hasta van juntos (formato YYYY-MM-DD)");
  process.exit(1);
}

type Fila = Record<string, unknown>;

// Recorre todas las páginas de un edge de la Graph API.
async function todas(ruta: string, params: Record<string, string>): Promise<Fila[]> {
  const url = new URL(`${API}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let siguiente: string | undefined = url.toString();
  const filas: Fila[] = [];
  while (siguiente) {
    const res: Response = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}` } });
    const body: { data: Fila[]; paging?: { next?: string }; error?: { message?: string; code?: number } } = await res.json();
    if (!res.ok || body.error) {
      const e: { message?: string; code?: number } = body.error ?? {};
      console.error(`Meta respondió ${res.status}: ${e.message ?? JSON.stringify(body)}`);
      if (e.code === 190) console.error("-> El token venció o no es válido: genera uno nuevo.");
      if (e.code === 200 || e.code === 10) console.error("-> Al token le falta el permiso ads_read o acceso a esta cuenta publicitaria.");
      if (e.code === 100) console.error("-> Revisa META_ADS_ACCOUNT_ID.");
      process.exit(1);
    }
    filas.push(...body.data);
    siguiente = body.paging?.next;
  }
  return filas;
}

// Los resultados vienen como lista [{action_type, value}]; estas son las que
// sirven para un lavado (mensajes, visitas a la web, clics). El resto queda en crudo.json.
const ACCIONES = [
  "link_click",
  "landing_page_view",
  "onsite_conversion.messaging_conversation_started_7d",
  "lead",
  "offsite_conversion.fb_pixel_purchase",
  "post_engagement",
  "video_view",
];
const accion = (fila: Fila, tipo: string, campo = "actions") =>
  (fila[campo] as { action_type: string; value: string }[] | undefined)?.find((a) => a.action_type === tipo)?.value ?? "";

const rango: Record<string, string> = desde
  ? { time_range: JSON.stringify({ since: desde, until: hasta }) }
  : { date_preset: "maximum" };
const camposInsights = "campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpm,actions,cost_per_action_type";

console.log(`Cuenta ${cuenta}, ${desde ? `${desde} a ${hasta}` : "toda la historia"}...`);
const campanas = await todas(`${cuenta}/campaigns`, {
  fields: "id,name,status,effective_status,objective,created_time,start_time,stop_time,daily_budget,lifetime_budget",
  limit: "200",
});
const totales = await todas(`${cuenta}/insights`, { level: "campaign", fields: camposInsights, limit: "500", ...rango });
const diario = await todas(`${cuenta}/insights`, {
  level: "campaign",
  fields: camposInsights,
  time_increment: "1",
  limit: "500",
  ...rango,
});

const csv = (filas: (string | number | undefined)[][]) =>
  filas.map((f) => f.map((v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

const colsMetricas = ["gasto", "impresiones", "alcance", "frecuencia", "clics", "clics_link", "ctr", "cpm", ...ACCIONES];
const metricas = (i: Fila | undefined) => i
  ? [i.spend, i.impressions, i.reach, i.frequency, i.clicks, i.inline_link_clicks, i.ctr, i.cpm, ...ACCIONES.map((a) => accion(i, a))] as string[]
  : colsMetricas.map(() => "");

const totalPorCampana = new Map(totales.map((t) => [t.campaign_id as string, t]));
const salida = "scripts/meta-ads";
mkdirSync(salida, { recursive: true });
writeFileSync(`${salida}/campanas.csv`, csv([
  ["campana_id", "nombre", "estado", "estado_efectivo", "objetivo", "creada", "inicio", "fin", "presupuesto_diario", "presupuesto_total", ...colsMetricas],
  ...campanas.map((c) => [
    c.id, c.name, c.status, c.effective_status, c.objective, c.created_time, c.start_time, c.stop_time,
    c.daily_budget, c.lifetime_budget, ...metricas(totalPorCampana.get(c.id as string)),
  ] as string[]),
]));
writeFileSync(`${salida}/diario.csv`, csv([
  ["fecha", "campana_id", "nombre", ...colsMetricas],
  ...diario
    .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))
    .map((d) => [d.date_start, d.campaign_id, d.campaign_name, ...metricas(d)] as string[]),
]));
writeFileSync(`${salida}/crudo.json`, JSON.stringify({ cuenta, desde, hasta, bajadoEn: new Date().toISOString(), campanas, totales, diario }, null, 2));

const gastoTotal = totales.reduce((s, t) => s + Number(t.spend ?? 0), 0);
console.log(`${campanas.length} campañas, ${diario.length} filas diarias, gasto total ${gastoTotal.toLocaleString("es-CL")}.`);
console.log(`Listo en ${salida}/ (campanas.csv, diario.csv, crudo.json)`);
