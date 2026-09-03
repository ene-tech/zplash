// Le agrega un boton a la web a los templates que quedaron en MARKETING.
//
// El razonamiento: la categoria de un template aprobado no se puede bajar
// (error 3835031) y Meta insiste en clasificar como MARKETING todo lo que huela
// a renovacion u oferta — aviso_vencimiento_plan volvio a caer ahi con un texto
// puramente informativo. Si igual se paga la tarifa MARKETING, que al menos
// traigan trafico: un boton URL convierte mucho mejor que pedirle al cliente
// que escriba la direccion.
//
// A los que YA son UTILITY no se les toca: agregarles un boton de compra es
// justo lo que los haria reclasificar a MARKETING.
//
// El contenido SI se puede editar en un template aprobado (a diferencia de la
// categoria), pero la edicion lo devuelve a PENDING y no se puede enviar hasta
// que lo re-aprueben. Hoy no importa: todas las reglas de WhatsApp estan
// apagadas, asi que no hay nada en vuelo.
//
// Meta exige mandar los componentes COMPLETOS al editar, no solo el nuevo, asi
// que se lee cada template y se reescribe conservando HEADER/BODY/FOOTER.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-whatsapp-botones-web.mts [--aplicar]
const APLICAR = process.argv.includes("--aplicar");
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}

// El texto del boton admite 25 caracteres como maximo.
const BOTONES: Record<string, { text: string; url: string }> = {
  // Avisos de vencimiento: el cliente tiene que entrar a renovar o a ver su plan.
  aviso_vencimiento_plan: { text: "Ir a Mi Cuenta", url: "https://zplash.cl/cliente" },
  recordatorio_vencimiento_plan: { text: "Ir a Mi Cuenta", url: "https://zplash.cl/cliente" },
  // Rellamado con descuento: el objetivo es que compre, mandarlo a la web.
  rellamado_con_descuento_clientes_sin_plan: { text: "Ver planes", url: "https://zplash.cl" },
  // Cupon: el codigo se presenta en el local, pero en Mi Cuenta lo puede ver
  // de nuevo si borro el mensaje.
  entrega_codigo_cupon: { text: "Ver mi cupón", url: "https://zplash.cl/cliente" },
};

const res = await fetch(
  `https://graph.facebook.com/v25.0/${waba}/message_templates?limit=100&fields=name,status,category,components,id`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const data = (await res.json()) as any;
if (data.error) {
  console.error("Meta:", JSON.stringify(data.error, null, 2));
  process.exit(1);
}

console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
for (const [nombre, boton] of Object.entries(BOTONES)) {
  const t = data.data.find((x: any) => x.name === nombre);
  if (!t) {
    console.log(`  ${nombre}: no existe en el WABA, se salta`);
    continue;
  }
  const yaTiene = (t.components || []).find((c: any) => c.type === "BUTTONS");
  if (yaTiene) {
    console.log(`  ${nombre}: ya tiene botón (${yaTiene.buttons.map((b: any) => b.text).join(", ")}), se salta`);
    continue;
  }
  // Conserva todo lo que ya tenía y le suma los botones al final.
  const componentes = [...(t.components || []), { type: "BUTTONS", buttons: [{ type: "URL", ...boton }] }];
  console.log(`  ${nombre}  [${t.status} ${t.category}]`);
  console.log(`     + botón "${boton.text}" -> ${boton.url}`);

  if (APLICAR) {
    const r = await fetch(`https://graph.facebook.com/v25.0/${t.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ components: componentes }),
    });
    const out = (await r.json()) as any;
    if (out.error) console.error(`     ERROR: ${JSON.stringify(out.error.error_user_msg || out.error.message)}`);
    else console.log(`     LISTO (vuelve a revisión de Meta)`);
  }
}

if (!APLICAR) console.log(`\n(dry-run: no se escribió nada. Correr con --aplicar.)`);
else console.log(`\nRevisar con: npx tsx --env-file=.env.local scripts/templates-meta.mts`);
