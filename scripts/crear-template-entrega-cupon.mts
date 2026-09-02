// Crea y manda a aprobar el template "entrega_codigo_cupon" en el WABA: es el
// que usa enviarCuponAlCliente (@/lib/serverActions/cupones) para mandarle el
// código al cliente cuando está FUERA de la ventana de 24h — dentro de ella
// sale como texto libre y este template no se toca.
//
// Variables posicionales, en este orden: {{1}} nombre, {{2}} beneficio,
// {{3}} código, {{4}} fecha de caducidad.
//
// Historia de los rechazos del 2026-09-02, para no repetirlos:
//  - Categoría UTILITY -> INCORRECT_CATEGORY. Regalar un descuento es promoción
//    para Meta, aunque el cliente lo acabe de pedir en el mesón.
//  - Categoría MARKETING con el mismo texto -> INCORRECT_CATEGORY otra vez. El
//    cuerpo decía "Código: *{{3}}*", que el clasificador lee como un OTP
//    (categoría AUTHENTICATION, que tiene formato fijo y no admite cuerpo
//    propio). Redactado como cupón —"preséntalo en el local con el número"—
//    pasó a revisión sin problema.
//  - La categoría NO se puede editar después (error 3835031); hay que borrar el
//    template y volver a crearlo, y el nombre queda en cooldown un rato
//    (subcódigo 2388025). El contenido sí se edita libre con POST al id.
//
// Ojo: la conversación MARKETING cuesta más que la UTILITY. Cuando
// scripts/templates-meta.mts marque este template como MARKETING, es lo
// correcto — no intentar bajarlo a UTILITY.
//
// Uso: npx tsx --env-file=.env.local scripts/crear-template-entrega-cupon.mts
// Correr una sola vez. Revisar con scripts/templates-meta.mts hasta APPROVED.
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}

const res = await fetch(`https://graph.facebook.com/v25.0/${waba}/message_templates`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "entrega_codigo_cupon",
    language: "es_CL",
    category: "MARKETING",
    components: [
      {
        type: "BODY",
        text: "Hola {{1}} 👋 Tenemos listo tu cupón de ZPlash 🚗\n\nTe regalamos {{2}} para tu próximo lavado. Preséntalo en el local con el número {{3}} antes del {{4}} y te lo aplicamos al pagar.\n\n¡Te esperamos!",
        example: { body_text: [["Juan", "$3.000 de descuento", "K7M4PQ", "30-09-2026"]] },
      },
    ],
  }),
});
const data = await res.json();
if (data.error) {
  console.error("Meta rechazó la creación:", JSON.stringify(data.error, null, 2));
  process.exit(1);
}
console.log("Template enviado a revisión:", data);
