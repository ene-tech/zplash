// Template "lavado_unico_upgrade_plan": el WhatsApp que sale tras un lavado
// único de $9.990 invitando al upgrade a Plan X5, con el precio calculado por
// cliente (mismo que el correo "Invitación upgrade a plan"). Reemplaza en la
// regla "Confirmación compra lavado unico $9.990 + promo contrata tu plan" a
// `confirmacion_lavado_unico`, que solo confirmaba el lavado.
//
// Variables posicionales: {{1}} nombre, {{2}} patente, {{3}} precioUpgrade,
// {{4}} patente otra vez, para el link directo a la inscripción de tarjeta
// (/pagar?item=plan&patente=..., el mismo del QR del mesón y del bot: llega
// con la patente puesta y el primer cobro ya con el precio de upgrade). Va en
// el cuerpo y no como botón: enviarSegunPlantilla no manda parámetros de botón
// y los otros templates tienen botones de URL fija.
// Categoría MARKETING: es una promoción (ver crear-template-entrega-cupon.mts,
// UTILITY la rechaza Meta con INCORRECT_CATEGORY).
//
// Uso, en dos pasos:
//   1. npx tsx --env-file=.env.local scripts/crear-template-upgrade-lavado-unico.mts
//      Lo manda a revisión de Meta (si ya existe, le reemplaza el texto).
//   2. npx tsx --env-file=.env.local scripts/crear-template-upgrade-lavado-unico.mts --activar
//      Cuando Meta lo tenga APPROVED y el código que calcula {{precioUpgrade}}
//      para WhatsApp (dispararPorVenta en @/lib/whatsapp/reglas/disparadores)
//      ya esté DESPLEGADO: antes de eso el mensaje saldría con el precio vacío.
//      Crea la plantilla en la base y apunta la regla a ella.
import postgres from "postgres";

const NOMBRE = "lavado_unico_upgrade_plan";
const REGLA_ID = "c1785023347517636";
const PLANTILLA_ID = "wa-lavado-unico-upgrade-plan";
const TEXTO =
  "Hola {{1}} 👋 Gracias por lavar tu 🚘 {{2}} en ZPlash.\n\nSi vienes seguido, te conviene el Plan X5: 5 lavados Full Túnel al mes con un solo pago. Por tu lavado de hoy, puedes activarlo por solo {{3}} pagando con tu tarjeta aquí:\nhttps://zplash.cl/pagar?item=plan&patente={{4}}\n\nLa promo dura unos días, ¡aprovéchala!";

const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}
const api = `https://graph.facebook.com/v25.0/${waba}/message_templates`;

const buscar = () =>
  fetch(`${api}?name=${NOMBRE}&fields=id,name,status,category`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((d) => d.data?.find((x: { name: string }) => x.name === NOMBRE));

if (!process.argv.includes("--activar")) {
  // Si ya existe se edita el contenido (vuelve a revisión); la categoría no
  // se puede cambiar así.
  const existente = await buscar();
  const components = [{ type: "BODY", text: TEXTO, example: { body_text: [["Juan", "SZGH65", "$10.000", "SZGH65"]] } }];
  const res = await fetch(existente ? `https://graph.facebook.com/v25.0/${existente.id}` : api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(existente ? { components } : { name: NOMBRE, language: "es_CL", category: "MARKETING", components }),
  });
  const data = await res.json();
  if (data.error) {
    console.error("Meta rechazó la creación:", JSON.stringify(data.error, null, 2));
    process.exit(1);
  }
  console.log("Template enviado a revisión:", data);
  process.exit(0);
}

const t = await buscar();
if (t?.status !== "APPROVED") {
  console.error(`Todavía no está aprobado en Meta: ${t ? `${t.status} ${t.category}` : "no existe"}. No se tocó nada.`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  await sql`
    insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo, meta_nombre, meta_idioma, meta_variables, meta_aprobado)
    values (${PLANTILLA_ID}, 'Lavado único $9.990 + upgrade a Plan X5', 'Proceso de venta',
      ${TEXTO.replace("{{1}}", "{{nombre}}").replace("{{2}}", "{{patente}}").replace("{{3}}", "{{precioUpgrade}}").replace("{{4}}", "{{patente}}")},
      true, ${NOMBRE}, 'es_CL', ${sql.json(["nombre", "patente", "precioupgrade", "patente"])}, true)
    on conflict (id) do update set meta_aprobado = true`;
  await sql`update reglas_whatsapp set plantilla_whatsapp_id = ${PLANTILLA_ID} where id = ${REGLA_ID}`;
  console.log(`Listo: la regla ${REGLA_ID} ahora manda ${NOMBRE}.`);
} finally {
  await sql.end();
}
