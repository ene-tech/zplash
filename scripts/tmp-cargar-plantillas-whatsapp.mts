// One-off (ago-2026): carga en plantillas_whatsapp los 5 textos finales de los
// templates que faltan aprobar en Meta, con su metaNombre/metaIdioma/
// metaVariables. NO toca meta_aprobado: ese check lo marca el dueño recién
// cuando Meta aprueba de verdad.
//
// Los cuerpos se leen del HTML del entregable, no se re-tipean acá: una sola
// fuente de verdad evita que el texto de la app y el del documento se separen.
// metaVariables se deriva del orden de aparición de los {{...}} en el propio
// cuerpo, que es exactamente lo que hace el autorrellenado de la app.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-cargar-plantillas-whatsapp.mts [--aplicar]
// Sin --aplicar solo muestra el diff. Con --aplicar deja respaldo-plantillas-whatsapp.json
// (rollback: volver a poner mensaje/meta_nombre/meta_idioma/meta_variables de ese archivo).
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const HTML = "C:/Users/Admin/AppData/Local/Temp/claude/c--Users-Admin-Documents-myApps-zplash/2498a871-de36-4e79-9b60-97d7b518a1ab/scratchpad/plantillas-whatsapp.html";
const IDIOMA = "es_CL";
const aplicar = process.argv.includes("--aplicar");

const DESTINO: Record<string, { fila: string; metaNombre: string }> = {
  t1: { fila: "wa-vencimiento-proximo", metaNombre: "recordatorio_vencimiento_plan" },
  t2: { fila: "wa-renovacion-confirmada", metaNombre: "confirmacion_renovacion_plan" },
  t3: { fila: "wa-cobro-automatico-exitoso", metaNombre: "cobro_automatico_exitoso" },
  t4: { fila: "wa-cobro-automatico-fallido", metaNombre: "cobro_automatico_fallido" },
  t5: { fila: "wa-reactivacion-plan-vencido", metaNombre: "confirmacion_reactivacion_plan" },
};

const html = readFileSync(HTML, "utf8");

function cuerpoDelHtml(id: string): string {
  // indexOf y no regex: no hay escapes que se puedan perder al copiar el archivo.
  const abre = `<pre class="msg" id="${id}">`;
  const i = html.indexOf(abre);
  const j = html.indexOf("</pre>", i);
  if (i < 0 || j < 0) throw new Error(`No encontré el bloque ${id} en el HTML`);
  return html.slice(i + abre.length, j)
    .replace(/<span class="v">([\s\S]*?)<\/span>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// Mismo criterio que convertirVariablesMeta (@/lib/helpers/whatsapp): orden de
// primera aparición, una variable repetida reutiliza su posición.
function variablesEnOrden(cuerpo: string): string[] {
  const vistas: string[] = [];
  for (const m of cuerpo.matchAll(/\{\{(\w+)\}\}/g)) if (!vistas.includes(m[1])) vistas.push(m[1]);
  return vistas.map((v) => v.toLowerCase());
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const previos = await sql`
  select id, nombre, mensaje, meta_nombre, meta_idioma, meta_variables, meta_aprobado
  from plantillas_whatsapp where id in ${sql(Object.values(DESTINO).map((d) => d.fila))}`;

if (previos.length !== 5) throw new Error(`Esperaba 5 filas, encontré ${previos.length}`);
const yaAprobada = previos.find((p) => p.meta_aprobado);
if (yaAprobada) throw new Error(`La fila ${yaAprobada.id} ya está marcada como aprobada; no la piso`);

for (const [idHtml, { fila, metaNombre }] of Object.entries(DESTINO)) {
  const cuerpo = cuerpoDelHtml(idHtml);
  const vars = variablesEnOrden(cuerpo);
  const antes = previos.find((p) => p.id === fila)!;

  console.log(`\n=== ${fila}  ->  ${metaNombre} [${IDIOMA}]`);
  console.log(`  variables: ${JSON.stringify(antes.meta_variables)}  ->  ${JSON.stringify(vars)}`);
  console.log(`  metaNombre: ${antes.meta_nombre ?? "(null)"}  ->  ${metaNombre}`);
  console.log(`  metaIdioma: ${antes.meta_idioma ?? "(null)"}  ->  ${IDIOMA}`);
  console.log(`  cuerpo nuevo:\n${cuerpo.split("\n").map((l) => "    | " + l).join("\n")}`);

  if (aplicar) {
    await sql`
      update plantillas_whatsapp
      set mensaje = ${cuerpo}, meta_nombre = ${metaNombre}, meta_idioma = ${IDIOMA},
          meta_variables = ${sql.json(vars)}
      where id = ${fila}`;
  }
}

if (aplicar) {
  writeFileSync("respaldo-plantillas-whatsapp.json", JSON.stringify(previos, null, 2));
  console.log("\nAPLICADO. Respaldo en respaldo-plantillas-whatsapp.json");
} else {
  console.log("\n(dry run — nada escrito; agrega --aplicar)");
}
await sql.end();
