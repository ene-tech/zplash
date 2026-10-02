// Campaña masiva "Regala y Gana" (oct-2026): lanza el programa de referidos
// (ver src/lib/referidos.ts) a todos los clientes con WhatsApp. Un teléfono =
// un mensaje, con la patente del cliente de ese teléfono que vino más
// recientemente (el link ?ref= premia a esa patente).
//
// Fuera: sin_comunicacion_auto y el grupo de CONTROL de la campaña de primavera
// (scripts/campana-primavera-2026-A/B.json), que se mide ~10-oct y no se puede
// contaminar. Los tratados de primavera sí reciben.
//
// Reanudable: con --enviar salta los teléfonos que ya recibieron este template,
// así que si se corta (red, timeout) se vuelve a correr y sigue donde quedó.
//
// Template MARKETING `campana_regala_y_gana`: {{1}} nombre, {{2}} y {{3}}
// descuentoReferido, {{4}} patente. No termina en variable (Meta lo rechaza).
//
// Uso:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-regala-y-gana-oct-2026.mts --template
//     Manda el template a revisión de Meta.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-regala-y-gana-oct-2026.mts
//     Simulacro: conteos y un ejemplo; no escribe ni envía nada.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/campana-regala-y-gana-oct-2026.mts --enviar
//     Envía (solo si el template está APPROVED).
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { enviarMensajesMasivosWhatsapp } from "@/lib/whatsapp/masivo";
import { construirVariables } from "@/lib/whatsapp/reglas/motor";
import { getConfig } from "@/lib/dataAccess/config";

const META = "campana_regala_y_gana";
const PLANTILLA_ID = "wa-campana-regala-y-gana";
const TEXTO =
  "Hola {{1}} 👋 En ZPlash estrenamos Regala y Gana 🎁\n\nReenvía este mensaje a un amigo con auto: él recibe {{2}} de descuento en su primer lavado y, cuando lo use, tú ganas {{3}} para tu próxima compra. Ganas un premio por cada amigo que venga.\n\n👇 Si te reenviaron este mensaje, activa tu descuento dejando tu patente aquí:\nhttps://zplash.cl/?ref={{4}}\n\n¡Nos vemos en el túnel! 🚿";
const VARIABLES = ["nombre", "descuentoreferido", "descuentoreferido", "patente"];

const token = process.env.META_WHATSAPP_TOKEN;
const api = `https://graph.facebook.com/v25.0/${process.env.META_WABA_ID}/message_templates`;
const estadoTemplate = () =>
  fetch(`${api}?name=${META}&fields=id,name,status`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((d) => d.data?.find((t: { name: string }) => t.name === META) as { id: string; status: string } | undefined);

if (process.argv.includes("--template")) {
  const existente = await estadoTemplate();
  const components = [{ type: "BODY", text: TEXTO, example: { body_text: [["Juan", "$2.000", "$2.000", "SZGH65"]] } }];
  const res = await fetch(existente ? `https://graph.facebook.com/v25.0/${existente.id}` : api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(existente ? { components } : { name: META, language: "es_CL", category: "MARKETING", components }),
  });
  console.log(JSON.stringify(await res.json()));
  process.exit(0);
}

const enviar = process.argv.includes("--enviar");
const control = ["A", "B"].flatMap(
  (g) => (JSON.parse(readFileSync(`scripts/campana-primavera-2026-${g}.json`, "utf8")).control as { id: string }[]).map((c) => c.id)
);

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = await sql<{ id: string; tel: string }[]>`
    with ui as (select cliente_id, max(fecha) f from ingresos where cliente_id is not null group by 1),
    uv as (select cliente_id, max(fecha) f from ventas where cliente_id is not null group by 1),
    b as (
      select c.id, regexp_replace(c.telefono, '[^0-9]', '', 'g') tel, greatest(ui.f, uv.f, c.ultima_visita) ult
      from clientes c left join ui on ui.cliente_id = c.id left join uv on uv.cliente_id = c.id
      where not coalesce(c.sin_comunicacion_auto, false) and c.patente !~ '^SIN-PATENTE'
    ),
    excluidos as (select tel from b where id = any(${control})),
    ya as (
      select distinct regexp_replace(cv.telefono, '[^0-9]', '', 'g') tel
      from mensajes_whatsapp m join conversaciones_whatsapp cv on cv.id = m.conversacion_id
      where m.texto like ${`%${META}%`}
    )
    select distinct on (tel) id, tel from b
    where tel ~ '^569[0-9]{8}$' and tel not in (select tel from excluidos where tel is not null) and tel not in (select tel from ya)
    order by tel, ult desc nulls last`;
  console.log(`${filas.length} teléfonos por enviar (${control.length} clientes de control de primavera excluidos)`);

  const estado = (await estadoTemplate())?.status;
  console.log(`Template ${META}: ${estado ?? "no existe"}`);
  if (filas.length) {
    const [ejemplo] = await getClientesByIds([filas[0].id]);
    const vars = construirVariables({ cliente: ejemplo, descuentoReferido: (await getConfig()).descuentoReferidoValor });
    console.log("Ejemplo {{1..4}}:", [vars.nombre, vars.descuentoReferido, vars.descuentoReferido, vars.patente]);
  }
  if (!enviar) throw new Error("simulacro: no se escribió ni envió nada. Agregar --enviar");
  if (estado !== "APPROVED") throw new Error("Template no aprobado todavía, no se envía.");

  await sql`insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo, meta_nombre, meta_idioma, meta_variables, meta_aprobado)
    values (${PLANTILLA_ID}, 'Campaña Regala y Gana (oct-2026)', 'Campañas',
      ${TEXTO.replace("{{1}}", "{{nombre}}").replace("{{2}}", "{{descuentoReferido}}").replace("{{3}}", "{{descuentoReferido}}").replace("{{4}}", "{{patente}}")},
      true, ${META}, 'es_CL', ${sql.json(VARIABLES)}, true)
    on conflict (id) do nothing`;
  writeFileSync(
    `scripts/campana-regala-y-gana-oct-2026-${Date.now()}.json`,
    JSON.stringify({ enviadoEn: new Date().toISOString(), clienteIds: filas.map((f) => f.id) }, null, 2)
  );

  const r = await enviarMensajesMasivosWhatsapp({ plantillaId: PLANTILLA_ID, clienteIds: filas.map((f) => f.id), enviadoPor: "campana-regala-y-gana-oct-2026" });
  console.log(r);
} catch (e) {
  console.log(`\n${(e as Error).message}`);
} finally {
  await sql.end();
  process.exit();
}
