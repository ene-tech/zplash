// Lista los message templates del WABA contra la Graph API: nombre, estado,
// categoría e idioma reales. Dos usos:
//  1) confirmar que META_WABA_ID quedó bien (si está mal, Meta responde
//     "(#100) nonexisting field (message_templates)" — es el síntoma de tener
//     ahí el App ID en vez del WhatsApp Business Account ID).
//  2) el chequeo mensual de categoría: Meta re-clasifica templates aprobados
//     de UTILITY a MARKETING sin avisar ni fallar, solo empieza a cobrar más.
//
// Uso: npx tsx --env-file=.env.local scripts/templates-meta.mts [WABA_ID]
// Sin argumento usa process.env.META_WABA_ID.
const waba = process.argv[2] || process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID (o pasarlo como argumento) y META_WHATSAPP_TOKEN");
  process.exitCode = 1;
}

const res = await fetch(
  `https://graph.facebook.com/v25.0/${waba}/message_templates?limit=100&fields=name,language,status,category`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const data = await res.json();

if (!waba || !token) {
  // ya se avisó arriba
} else if (data.error) {
  console.error("Meta rechazó la consulta:", data.error.message);
  if (data.error.code === 100) {
    console.error("\n-> Ese ID no es un WhatsApp Business Account. Sácalo de");
    console.error("   developers.facebook.com/apps/<APP_ID>/whatsapp-business/wa-dev-console/");
    console.error("   campo 'Identificador de la cuenta de WhatsApp Business'.");
  }
  process.exitCode = 1;
} else {
    const filas = (data.data || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
  console.log(`${filas.length} templates en el WABA ${waba}\n`);
  for (const t of filas) {
    const alerta = t.category === "MARKETING" ? "  <-- MARKETING, revisar si debería ser UTILITY" : "";
    console.log(`${t.status.padEnd(10)} ${t.category.padEnd(10)} ${t.language.padEnd(6)} ${t.name}${alerta}`);
  }
}
