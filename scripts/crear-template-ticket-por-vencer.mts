// Template "ticket_reactivacion_por_vencer": el WhatsApp que avisa 10 días
// antes de que venza un ticket sin usar de la promo de reactivación (regla
// "ticket_por_vencer", ver @/lib/whatsapp/reglas/cron).
//
// Variables posicionales: {{1}} nombre, {{2}} fechaVencimientoCupon, {{3}}
// codigoCupon. Categoría MARKETING y el código redactado como número del
// ticket, no como "Código: X" (Meta lo lee como OTP y lo rechaza, ver
// crear-template-entrega-cupon.mts).
//
// Uso, en dos pasos:
//   1. npx tsx --env-file=.env.local scripts/crear-template-ticket-por-vencer.mts
//      Lo manda a revisión de Meta (si ya existe, le reemplaza el texto).
//   2. npx tsx --env-file=.env.local scripts/crear-template-ticket-por-vencer.mts --activar
//      Cuando Meta lo tenga APPROVED y el código de "ticket_por_vencer" ya esté
//      DESPLEGADO: crea la plantilla en la base y la regla activa a 10 días.
import postgres from "postgres";

const NOMBRE = "ticket_reactivacion_por_vencer";
const PLANTILLA_ID = "wa-ticket-reactivacion-por-vencer";
const REGLA_ID = "regla-ticket-reactivacion-por-vencer";
const DIAS_ANTES = 10;
const TEXTO =
  "Hola {{1}} 👋 Tu lavado full túnel gratis de ZPlash está pronto a vencer: vale hasta el {{2}}.\n\nPara usarlo, preséntalo en el local con el número de ticket {{3}}. Sirve para cualquier vehículo, el tuyo o el de un amigo.\n\n¡Te esperamos en el túnel! 🚿";

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
  const existente = await buscar();
  const components = [{ type: "BODY", text: TEXTO, example: { body_text: [["Juan", "26-10-2026", "F9UPF9"]] } }];
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
    values (${PLANTILLA_ID}, 'Ticket promo reactivación por vencer', 'Ofertas y servicios',
      ${TEXTO.replace("{{1}}", "{{nombre}}").replace("{{2}}", "{{fechaVencimientoCupon}}").replace("{{3}}", "{{codigoCupon}}")},
      true, ${NOMBRE}, 'es_CL', ${sql.json(["nombre", "fechavencimientocupon", "codigocupon"])}, true)
    on conflict (id) do update set meta_aprobado = true`;
  await sql`
    insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_dias_antes_vencimiento, accion, plantilla_whatsapp_id, creado_por)
    values (${REGLA_ID}, 'Aviso: ticket promo reactivación por vencer', true, 'ticket_por_vencer', ${DIAS_ANTES}, 'mensaje_simple', ${PLANTILLA_ID}, 'script')
    on conflict (id) do update set activa = true`;
  console.log(`Listo: regla ${REGLA_ID} activa, avisa ${DIAS_ANTES} días antes con ${NOMBRE}.`);
} finally {
  await sql.end();
}
