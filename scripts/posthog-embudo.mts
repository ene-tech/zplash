// Embudo de la web pública leído desde PostHog (solo lectura, región EU).
//
// Uso: npx tsx --env-file=.env.local scripts/posthog-embudo.mts [desde=2026-10-07]
//
// Necesita en .env.local:
//   POSTHOG_PERSONAL_KEY=phx_...   (PostHog → Settings → Personal API keys,
//                                   scopes: query:read y project:read)
//   POSTHOG_PROJECT_ID=12345       (opcional; si falta usa el proyecto actual)
//
// Ojo al leer: desde el 21-oct-2026 PostHog solo cuenta a quien acepta el
// aviso de cookies, así que las semanas de antes y después no se comparan en
// volumen, solo en proporciones. La mitad de pago (Transbank) está en la base:
// pagos_webpay, ver memoria posthog-analitica-web.

const KEY = process.env.POSTHOG_PERSONAL_KEY;
const PROYECTO = process.env.POSTHOG_PROJECT_ID || "@current";
const HOST = "https://eu.posthog.com";
const desde = process.argv[2] || "2026-10-07";

if (!KEY) {
  console.error("Falta POSTHOG_PERSONAL_KEY en .env.local");
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
  console.error("La fecha va como AAAA-MM-DD");
  process.exit(1);
}

async function hogql(titulo: string, query: string) {
  const r = await fetch(`${HOST}/api/projects/${PROYECTO}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!r.ok) {
    console.error(`\n${titulo}: HTTP ${r.status}\n${(await r.text()).slice(0, 500)}`);
    return;
  }
  const j = (await r.json()) as { columns: string[]; results: unknown[][] };
  console.log(`\n== ${titulo} ==`);
  console.table(j.results.map((fila) => Object.fromEntries(j.columns.map((c, i) => [c, fila[i]]))));
}

const VISTAS = `event = '$pageview' and timestamp >= toDateTime('${desde}')`;
const PASOS = `
  uniq(person_id) as personas,
  uniqIf(person_id, properties.$pathname = '/') as inicio,
  uniqIf(person_id, properties.$pathname like '/servicios/%' or properties.$pathname in ('/tickets', '/pack-tickets')) as producto,
  uniqIf(person_id, properties.$pathname = '/carrito') as carrito,
  uniqIf(person_id, properties.$pathname = '/pagar') as pagar,
  uniqIf(person_id, properties.$pathname = '/pagar/resultado' and properties.$current_url like '%estado=ok%') as pago_ok,
  uniqIf(person_id, properties.$pathname like '/cliente%') as mi_cuenta`;

await hogql(
  "Personas por paso, por semana",
  `select toStartOfWeek(timestamp, 1) as semana, ${PASOS}
   from events where ${VISTAS} group by semana order by semana`,
);

// Por sesión y con las propiedades del evento: los visitantes son anónimos y
// PostHog no les guarda propiedades de persona ($initial_utm_source sale vacío).
// Los SMS no llevan utm (nov-2026): caen en "$direct".
await hogql(
  "Sesiones por canal de llegada",
  `with s as (
     select $session_id as sid,
       argMin(coalesce(nullIf(properties.utm_source, ''), nullIf(properties.$referring_domain, ''), 'sin dato'), timestamp) as canal,
       max(properties.$pathname = '/pagar') as llego_pagar,
       max(properties.$pathname = '/pagar/resultado' and properties.$current_url like '%estado=ok%') as pago
     from events where ${VISTAS} group by sid)
   select canal, count() as sesiones, sum(llego_pagar) as a_pagar, sum(pago) as pagaron
   from s group by canal order by sesiones desc limit 20`,
);

// Pasos dentro de /pagar según el ?item= con que se abrió. Plan: Buscar →
// botón de pago. Lavado único/packs: Continuar (patente) → Pagar ahora.
// Lo que pasa entre el botón y pago_ok ocurre en Transbank, fuera de PostHog.
await hogql(
  "Embudo dentro de /pagar por producto (sesiones)",
  `with s as (
     select $session_id as sid,
       groupUniqArrayIf(extract(properties.$current_url, 'item=([^&]+)'), properties.$pathname = '/pagar' and event = '$pageview') as items,
       max(properties.$pathname = '/pagar' and elements_chain_texts[1] = 'Buscar') as f_buscar,
       max(properties.$pathname = '/pagar' and elements_chain_texts[1] = 'Continuar') as f_cont,
       max(properties.$pathname = '/pagar' and (elements_chain_texts[1] = 'Pagar ahora' or elements_chain_texts[1] like 'Activar renovaci%' or elements_chain_texts[1] like 'Contratar Plan%')) as f_boton,
       max(properties.$pathname = '/pagar/resultado' and properties.$current_url like '%estado=ok%') as f_ok
     from events where ${VISTAS.replace("event = '$pageview' and ", "")} group by sid)
   select arrayJoin(items) as item, count() as abrio, sum(f_buscar) as buscar, sum(f_cont) as continuar, sum(f_boton) as boton_pago, sum(f_ok) as pago_ok
   from s where length(items) > 0 group by item order by abrio desc`,
);

await hogql(
  "Celular vs computador",
  `select properties.$device_type as equipo, ${PASOS}
   from events where ${VISTAS} group by equipo order by personas desc`,
);

await hogql(
  "Páginas más vistas",
  `select properties.$pathname as pagina, count() as vistas, uniq(person_id) as personas
   from events where ${VISTAS} group by pagina order by personas desc limit 25`,
);

await hogql(
  "Qué productos miran los que llegan a /pagar sin pagar",
  `with llegaron as (
     select person_id from events where ${VISTAS} and properties.$pathname = '/pagar' group by person_id
   ), pagaron as (
     select person_id from events where ${VISTAS} and properties.$pathname = '/pagar/resultado' and properties.$current_url like '%estado=ok%' group by person_id
   )
   select properties.$pathname as pagina, uniq(person_id) as personas
   from events
   where ${VISTAS} and person_id in (select person_id from llegaron) and person_id not in (select person_id from pagaron)
     and (properties.$pathname like '/servicios/%' or properties.$pathname in ('/tickets', '/pack-tickets', '/carrito'))
   group by pagina order by personas desc limit 15`,
);

await hogql(
  "Grabaciones de sesión que pasaron por /pagar sin pagar (para mirar en el panel)",
  `select $session_id as sesion, min(timestamp) as inicio, any(properties.$device_type) as equipo
   from events
   where ${VISTAS} and properties.$pathname = '/pagar' and $session_id is not null
     and $session_id not in (
       select $session_id from events where ${VISTAS} and properties.$pathname = '/pagar/resultado' and properties.$current_url like '%estado=ok%'
     )
   group by sesion order by inicio desc limit 20`,
);
