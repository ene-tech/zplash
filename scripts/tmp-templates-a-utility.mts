// One-off (ago-2026): pasa a UTILITY los templates de confirmación que Meta
// tenía como MARKETING, y crea los 3 UTILITY que el catálogo referencia pero
// que nunca se subieron al WABA.
//
// Meta NO deja cambiar la categoría de un template ya aprobado por API
// ("No puedes actualizar una categoría de plantilla aprobada"), así que los dos
// que estaban mal clasificados se suben con NOMBRE NUEVO en vez de editarse.
// Tampoco sirve borrar primero: el nombre de un template borrado queda
// reservado 30 días. Orden correcto: crear el reemplazo -> esperar APPROVED ->
// repuntar meta_nombre en plantillas_whatsapp -> recién ahí borrar el viejo.
//
// El contenido va sin promo, upsell ni botón de reseña a propósito: la guía de
// Meta para UTILITY exige que el mensaje "no promocione, recomiende, haga
// upsell, incluya ofertas ni intente asegurar renovaciones" — con eso adentro
// Meta lo vuelve a aprobar como MARKETING aunque se pida UTILITY.
// El orden de las variables se conserva igual al actual para no invalidar
// `meta_variables` de las filas ya cuadradas.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-templates-a-utility.mts [--aplicar]
const aplicar = process.argv.includes("--aplicar");
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
const API = "https://graph.facebook.com/v25.0";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const body = (text: string, ejemplo: string[]) => ({
  type: "BODY",
  text,
  ...(ejemplo.length ? { example: { body_text: [ejemplo] } } : {}),
});

// name -> componentes. `reemplazaA` = template MARKETING que este jubila.
const OBJETIVO: Record<string, { reemplazaA?: string; language: string; components: any[] }> = {
  // Sale el botón "AYUDANOS CON TU COMENTARIO" (la reseña la pide
  // mensaje_cliente_plan_review_google) y la línea "te respetamos el precio",
  // que es exactamente el "intento de asegurar renovación" que prohíbe UTILITY.
  confirmacion_compra_plan: {
    reemplazaA: "confirmacion_compre_nuevo_plan",
    language: "es_CL",
    components: [
      { type: "HEADER", format: "TEXT", text: "Compra confirmada" },
      body(
        // Meta rechaza un cuerpo cuya última cosa es una variable ("Las variables
        // no pueden estar al principio ni al final"): un punto detrás de {{4}} no
        // le basta, exige texto real después.
        "¡Hola {{1}}👋! Confirmamos la compra de tu {{2}} para tu 🚗 {{3}}.\n\nTu plan queda vigente hasta el {{4}}.\n\nEn Mi Cuenta puedes ver el detalle.",
        ["JUAN", "PLAN ILIMITADO", "AABB11", "26/08/2026"]
      ),
      { type: "FOOTER", text: "Válido para pasar 1 vez cada 24hrs." },
    ],
  },
  // Queda como confirmación seca del lavado: el cuerpo anterior era íntegro la
  // oferta de $11.990 a 10 días. Esa promo ya la cubre
  // rellamado_con_descuento_clientes_sin_plan, que sigue en MARKETING.
  confirmacion_lavado_unico: {
    reemplazaA: "confirmacion_compra_lavado_unico",
    language: "es_CL",
    components: [
      body("Hola {{1}} 👋 Confirmamos tu lavado en ZPlash para tu 🚘 {{2}}.\n\nGracias por venir.", ["Juan", "ABCD12"]),
    ],
  },
  confirmacion_renovacion_plan: {
    language: "es_CL",
    components: [
      body(
        "Hola {{1}} 👋 Confirmamos la renovación de tu plan para tu 🚗 {{2}}.\n\nQueda vigente hasta el {{3}}. En Mi Cuenta puedes ver el detalle.",
        ["Juan", "AABB11", "26/09/2026"]
      ),
    ],
  },
  confirmacion_reactivacion_plan: {
    language: "es_CL",
    components: [
      body("Hola {{1}} 👋 Reactivamos tu plan en ZPlash.\n\nQueda vigente hasta el {{2}}. En Mi Cuenta puedes ver el detalle.", ["Juan", "26/09/2026"]),
    ],
  },
  recordatorio_vencimiento_plan: {
    language: "es_CL",
    components: [
      body("Hola {{1}} 👋 tu plan en ZPlash vence el {{2}}.\n\nEn Mi Cuenta puedes ver el estado de tu plan y administrarlo.", ["Juan", "26/09/2026"]),
    ],
  },
};

const res = await fetch(`${API}/${waba}/message_templates?limit=100&fields=name,language,status,category`, { headers });
const data = await res.json();
if (data.error) { console.error("Meta rechazó la consulta:", data.error.message); process.exit(1); }
const enMeta = new Map<string, any>(data.data.map((t: any) => [t.name, t]));

for (const [name, plan] of Object.entries(OBJETIVO)) {
  const actual = enMeta.get(name);
  if (actual) { console.log(`SALTO ${name}: ya existe (${actual.status}/${actual.category})`); continue; }

  const viejo = plan.reemplazaA ? enMeta.get(plan.reemplazaA) : undefined;
  const accion = viejo ? `crear (jubila ${plan.reemplazaA})` : "crear";
  console.log(`${aplicar ? "APLICA" : "dry-run"}  ${accion.padEnd(48)} ${name} -> UTILITY`);
  if (!aplicar) continue;

  const payload = { name, language: plan.language, category: "UTILITY", components: plan.components };
  const r = await fetch(`${API}/${waba}/message_templates`, { method: "POST", headers, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok || j.error) console.error(`   ERROR ${name}:`, j.error?.error_user_msg || j.error?.message || JSON.stringify(j));
  else console.log(`   ok ->`, JSON.stringify(j));
}

// Borra los MARKETING que quedaron jubilados. Doble condición a propósito: el
// reemplazo tiene que estar APPROVED y ninguna fila de plantillas_whatsapp
// puede seguir apuntando al viejo — borrarlo antes deja el catálogo apuntando a
// un template inexistente y todo envío falla. Correr primero
// tmp-sincronizar-templates-meta.mts --aplicar, que hace el repunte.
// Ojo: el nombre borrado queda reservado 30 días en Meta.
if (process.argv.includes("--borrar-viejos")) {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const enUso = new Set((await sql`SELECT meta_nombre FROM plantillas_whatsapp WHERE meta_nombre IS NOT NULL`).map((r) => r.meta_nombre));
  await sql.end();

  for (const [name, plan] of Object.entries(OBJETIVO)) {
    if (!plan.reemplazaA) continue;
    const nuevo = enMeta.get(name);
    const viejo = enMeta.get(plan.reemplazaA);
    if (!viejo) { console.log(`ya borrado: ${plan.reemplazaA}`); continue; }
    if (nuevo?.status !== "APPROVED") { console.log(`NO BORRA ${plan.reemplazaA}: su reemplazo ${name} está ${nuevo?.status ?? "sin crear"}`); continue; }
    if (enUso.has(plan.reemplazaA)) { console.log(`NO BORRA ${plan.reemplazaA}: plantillas_whatsapp todavía lo apunta (corre tmp-sincronizar-templates-meta.mts --aplicar)`); continue; }

    console.log(`${aplicar ? "APLICA" : "dry-run"}  borrar ${plan.reemplazaA} (MARKETING, reemplazado por ${name})`);
    if (!aplicar) continue;
    const r = await fetch(`${API}/${waba}/message_templates?hsm_id=${viejo.id}&name=${plan.reemplazaA}`, { method: "DELETE", headers });
    const j = await r.json();
    console.log(r.ok && !j.error ? `   borrado` : `   ERROR: ${j.error?.error_user_msg || j.error?.message || JSON.stringify(j)}`);
  }
}

if (!aplicar) console.log("\nDry-run: correr con --aplicar para escribir en Meta.");
