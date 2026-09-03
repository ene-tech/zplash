// Manda a aprobar las versiones UTILITY de dos templates que hoy estan como
// MARKETING sin que les corresponda.
//
// La categoria de un template aprobado NO se puede editar (error 3835031), asi
// que la unica via es crear otro con nombre distinto y repuntar la base cuando
// quede APPROVED. Los viejos siguen funcionando mientras tanto: no se borra
// nada hasta que el reemplazo este listo.
//
//   recordatorio_vencimiento_plan (MKT) -> aviso_vencimiento_plan (UTIL)
//     Texto identico. Es un aviso de la cuenta del cliente, sin oferta: no hay
//     motivo para que sea MARKETING.
//
//   fin_plan_ilimitado (quedo MKT) -> fin_plan_ilimitado_aviso (UTIL)
//     Lo mande como UTILITY el 2026-09-02 y Meta lo aprobo reclasificandolo a
//     MARKETING. El sospechoso es "ver las alternativas", que se lee como
//     invitacion a comprar. Esta version lo saca y deja solo el aviso.
//
// A los que ofrecen algo NO se les toca: entrega_codigo_cupon,
// rellamado_con_descuento_clientes_sin_plan y mensaje_cliente_plan_review_google
// estan bien como MARKETING.
//
// Uso: npx tsx --env-file=.env.local scripts/crear-templates-utility.mts
// Revisar despues con scripts/templates-meta.mts hasta APPROVED.
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}

const NUEVOS = [
  {
    name: "aviso_vencimiento_plan",
    reemplaza: "recordatorio_vencimiento_plan",
    text: "Hola {{1}} 👋 tu plan en ZPlash vence el {{2}}.\n\nEn Mi Cuenta puedes ver el estado de tu plan y administrarlo.",
    example: [["Juan", "12-09-2026"]],
  },
  {
    name: "fin_plan_ilimitado_aviso",
    reemplaza: "fin_plan_ilimitado",
    text:
      "Hola {{1}} 👋 Te avisamos que el Plan Ilimitado Mensual de tu patente {{2}} termina el {{3}}.\n\n" +
      "Hasta esa fecha sigues lavando sin límite, como siempre.\n\n" +
      "En Mi Cuenta puedes revisar tu plan y administrar tu cobro automático.",
    example: [["Cristofer", "HSXR40", "01-10-2026"]],
  },
];

for (const t of NUEVOS) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${waba}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: t.name,
      language: "es_CL",
      category: "UTILITY",
      components: [{ type: "BODY", text: t.text, example: { body_text: t.example } }],
    }),
  });
  const data = (await res.json()) as any;
  if (data.error) {
    console.error(`\n${t.name}: Meta rechazó la creación`);
    console.error(JSON.stringify(data.error, null, 2));
    continue;
  }
  console.log(`\n${t.name}  (reemplazaria a ${t.reemplaza})`);
  console.log(`  id=${data.id}  status=${data.status}  category=${data.category}`);
}
console.log(`\nRevisar el estado con: npx tsx --env-file=.env.local scripts/templates-meta.mts`);
console.log(`Cuando queden APPROVED como UTILITY, repuntar la base y recien ahi borrar los viejos.`);
