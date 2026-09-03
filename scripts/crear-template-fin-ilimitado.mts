// Crea y manda a aprobar el template "fin_plan_ilimitado" en el WABA: el aviso
// por WhatsApp de que el Plan Ilimitado Mensual del cliente se termina, 7 dias
// antes de su vencimiento. Acompaña al correo del mismo nombre.
//
// Variables posicionales, en este orden: {{1}} nombre, {{2}} patente,
// {{3}} fecha de vencimiento.
//
// POR QUE VA COMO UTILITY, Y POR QUE NO LLEVA PRECIO. Lo que aprendimos con
// entrega_codigo_cupon el 2026-09-02 (ver ese script): a Meta, ofrecer algo es
// promocion, y un template que ofrece cae en INCORRECT_CATEGORY si lo mandas
// como UTILITY. Este mensaje NO ofrece: informa un cambio en una suscripcion
// que el cliente ya tiene, que es exactamente lo que UTILITY cubre. Por eso no
// dice el precio del Plan X5 ni invita a contratarlo — eso lo hace el correo,
// que no tiene que pedirle permiso a nadie.
//
// El beneficio no es solo que lo aprueben: la conversacion UTILITY cuesta menos
// que la MARKETING, y a la MARKETING la bloquean los opt-out de promociones.
//
// OJO: la categoria NO se puede editar despues (error 3835031). Si sale mal hay
// que borrar el template y volver a crearlo, y el nombre queda en cooldown un
// rato (subcodigo 2388025). El contenido si se edita con POST al id.
//
// Uso: npx tsx --env-file=.env.local scripts/crear-template-fin-ilimitado.mts
// Correr una sola vez. Revisar con scripts/templates-meta.mts hasta APPROVED.
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}

const NOMBRE = "fin_plan_ilimitado";
const TEXTO =
  "Hola {{1}} 👋 Te avisamos que el Plan Ilimitado Mensual de tu patente {{2}} termina el {{3}}.\n\n" +
  "Hasta esa fecha sigues lavando sin límite, como siempre.\n\n" +
  "En Mi Cuenta puedes revisar tu plan, ver las alternativas y administrar tu cobro automático.";

const res = await fetch(`https://graph.facebook.com/v25.0/${waba}/message_templates`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: NOMBRE,
    language: "es_CL",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: TEXTO,
        example: { body_text: [["Cristofer", "HSXR40", "01-10-2026"]] },
      },
    ],
  }),
});
const data = await res.json();
if (data.error) {
  console.error("Meta rechazó la creación:", JSON.stringify(data.error, null, 2));
  process.exit(1);
}
console.log(`Template "${NOMBRE}" enviado a revisión:`, JSON.stringify(data, null, 2));
console.log(`\nTexto que se mandó:\n\n${TEXTO}\n`);
console.log("Revisar el estado con: npx tsx --env-file=.env.local scripts/templates-meta.mts");
