// One-off (ago-2026): alinea `plantillas_whatsapp` con los templates realmente
// aprobados en Meta. Trae el estado real de la Graph API (mismo endpoint que
// scripts/templates-meta.mts) y para cada plantilla del catálogo corrige
// meta_nombre / meta_idioma / meta_variables / mensaje y marca meta_aprobado
// solo si Meta responde APPROVED. Las que apuntan a un template que no existe
// en el WABA quedan en meta_aprobado=false.
//
// El mapeo Meta -> plantilla va explícito acá porque los {{1}},{{2}} de Meta
// son posicionales y no dicen qué variable son: el único rastro es el
// `example.body_text` del template (ej. "PLAN x5" en el {{2}} del fallido).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-sincronizar-templates-meta.mts [--aplicar]
// Deja respaldo-templates-meta.json (rollback: volver los campos por id).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

// meta template name -> { plantillaId, variables en el orden de {{1}},{{2}},... }
const MAPEO: Record<string, { plantillaId: string; variables: string[] }> = {
  cobro_automatico_exitoso: { plantillaId: "wa-cobro-automatico-exitoso", variables: ["nombre", "monto", "plan", "fechavencimiento"] },
  cobro_automatico_suscripcion_fallido: { plantillaId: "wa-cobro-automatico-fallido", variables: ["nombre", "plan"] },
  mensaje_cliente_plan_review_google: { plantillaId: "c1785083401950895", variables: ["nombre"] },
  rellamado_con_descuento_clientes_sin_plan: { plantillaId: "c1786098866637552", variables: ["nombre", "patente"] },
  // Reemplazos UTILITY de confirmacion_compra_lavado_unico y
  // confirmacion_compre_nuevo_plan (ver tmp-templates-a-utility.mts): Meta no
  // deja cambiar la categoría de un template aprobado, hubo que subirlos con
  // nombre nuevo. Mismo orden de variables que los viejos, así que repuntar es
  // solo cambiar meta_nombre.
  confirmacion_lavado_unico: { plantillaId: "c1785022762592662", variables: ["nombre", "patente"] },
  confirmacion_compra_plan: { plantillaId: "wa-compra-confirmada", variables: ["nombre", "plan", "patente", "fechavencimiento"] },
  confirmacion_renovacion_plan: { plantillaId: "wa-renovacion-confirmada", variables: ["nombre", "patente", "fechavencimiento"] },
  confirmacion_reactivacion_plan: { plantillaId: "wa-reactivacion-plan-vencido", variables: ["nombre", "fechavencimiento"] },
  recordatorio_vencimiento_plan: { plantillaId: "wa-vencimiento-proximo", variables: ["nombre", "fechavencimiento"] },
  // hello_world (sample de Meta) y mensaje_otp (lo manda enviarMensajePlantilla
  // directo en el flujo de verificación) no son del catálogo de reglas.
};

const aplicar = process.argv.includes("--aplicar");

const res = await fetch(
  `https://graph.facebook.com/v25.0/${process.env.META_WABA_ID}/message_templates?limit=100&fields=name,language,status,category,components`,
  { headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` } }
);
const data = await res.json();
if (data.error) { console.error("Meta rechazó la consulta:", data.error.message); process.exit(1); }
const enMeta = new Map<string, any>(data.data.map((t: any) => [t.name, t]));

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const filas = await sql`SELECT id, nombre, meta_nombre, meta_idioma, meta_variables, meta_aprobado, mensaje FROM plantillas_whatsapp ORDER BY nombre`;
writeFileSync("respaldo-templates-meta.json", JSON.stringify(filas, null, 2));

const cambios: { id: string; nombre: string; set: Record<string, unknown>; motivo: string[] }[] = [];

for (const [metaNombre, { plantillaId, variables }] of Object.entries(MAPEO)) {
  const t = enMeta.get(metaNombre);
  const fila = filas.find((f) => f.id === plantillaId);
  if (!t || !fila) { console.error(`SIN PAR: template "${metaNombre}" (${t ? "" : "no está en Meta; "}${fila ? "" : "no está la plantilla " + plantillaId})`); continue; }

  // Un template todavía en revisión no se repunta: dejar la fila apuntando al
  // que sí está aprobado hasta que Meta responda. Correr esto de nuevo después
  // hace el cambio solo. (Si la fila YA apunta acá, sigue de largo para poder
  // bajarle meta_aprobado si Meta lo rechazó o lo pausó.)
  if (t.status !== "APPROVED" && fila.meta_nombre !== metaNombre) {
    console.log(`espera: ${metaNombre} está ${t.status} en Meta, no se repunta "${fila.nombre}" todavía`);
    continue;
  }
  const body = t.components.find((c: any) => c.type === "BODY")?.text ?? "";
  const nVars = new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m: any) => m[1])).size;
  if (nVars !== variables.length) { console.error(`MAPEO MALO: ${metaNombre} tiene ${nVars} variables en Meta y el mapeo declara ${variables.length}`); continue; }
  // {{1}},{{2}}... -> {{nombre}},{{plan}}... para que el preview de la app sea
  // el texto realmente aprobado.
  const mensaje = body.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => `{{${variables[Number(n) - 1]}}}`);
  const aprobado = t.status === "APPROVED";

  const set: Record<string, unknown> = {}, motivo: string[] = [];
  if (fila.meta_nombre !== metaNombre) { set.meta_nombre = metaNombre; motivo.push(`meta_nombre ${fila.meta_nombre} -> ${metaNombre}`); }
  if (fila.meta_idioma !== t.language) { set.meta_idioma = t.language; motivo.push(`idioma ${fila.meta_idioma} -> ${t.language}`); }
  if ((fila.meta_variables ?? []).join(",") !== variables.join(",")) { set.meta_variables = variables; motivo.push(`variables [${fila.meta_variables ?? []}] -> [${variables}]`); }
  if (fila.mensaje.trim() !== mensaje.trim()) { set.mensaje = mensaje; motivo.push("mensaje != cuerpo aprobado"); }
  if (fila.meta_aprobado !== aprobado) { set.meta_aprobado = aprobado; motivo.push(`aprobado ${fila.meta_aprobado} -> ${aprobado} (${t.status})`); }
  if (motivo.length) cambios.push({ id: fila.id, nombre: fila.nombre, set, motivo });
}

// Las que apuntan a un template inexistente en el WABA no pueden estar aprobadas.
const mapeadas = new Set(Object.values(MAPEO).map((m) => m.plantillaId));
for (const fila of filas.filter((f) => !mapeadas.has(f.id))) {
  if (fila.meta_aprobado) cambios.push({ id: fila.id, nombre: fila.nombre, set: { meta_aprobado: false }, motivo: [`"${fila.meta_nombre}" no existe en el WABA`] });
  else if (fila.meta_nombre) console.log(`ok (sigue sin aprobar): ${fila.nombre} -> "${fila.meta_nombre}" no existe en Meta`);
}

for (const c of cambios) console.log(`${aplicar ? "APLICA" : "dry-run"}  ${c.nombre}\n    ${c.motivo.join("\n    ")}`);
console.log(`\n${cambios.length} plantilla(s) a corregir. Respaldo en respaldo-templates-meta.json`);

if (aplicar) {
  for (const c of cambios) await sql`UPDATE plantillas_whatsapp SET ${sql(c.set)} WHERE id = ${c.id}`;
  console.log("Aplicado.");
} else console.log("Dry-run: correr con --aplicar para escribir.");
await sql.end();
