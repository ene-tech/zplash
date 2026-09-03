// Corrige SOLO `meta_aprobado` en plantillas_whatsapp, leyendo el estado real
// de la Graph API. No toca meta_nombre, meta_variables ni mensaje.
//
// A diferencia de tmp-sincronizar-templates-meta.mts, que ademas reescribe el
// nombre y el texto: eso desharia repunteos hechos a proposito (ver
// tmp-whatsapp-a-utility.mts, que cambia a que template de Meta apunta cada
// plantilla para bajarla de MARKETING a UTILITY).
//
// Existe porque la columna se desincroniza: al 2026-09-03 decia false para tres
// templates que Meta tenia APPROVED hace rato, y enviarSegunPlantilla se guia
// por lo que dice la base.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-sincronizar-aprobacion-whatsapp.mts [--aplicar]
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
const waba = process.env.META_WABA_ID;
const token = process.env.META_WHATSAPP_TOKEN;
if (!waba || !token) {
  console.error("Falta META_WABA_ID o META_WHATSAPP_TOKEN en .env.local");
  process.exit(1);
}

const res = await fetch(`https://graph.facebook.com/v25.0/${waba}/message_templates?limit=200&fields=name,status,category`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = (await res.json()) as any;
if (data.error) {
  console.error("Meta:", JSON.stringify(data.error, null, 2));
  process.exit(1);
}
const enMeta = new Map<string, { status: string; category: string }>(
  data.data.map((t: any) => [t.name, { status: t.status, category: t.category }])
);

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = (await sql`
    select id, nombre, meta_nombre, meta_aprobado from plantillas_whatsapp
    where meta_nombre is not null order by meta_nombre`) as any[];

  console.log(`${APLICAR ? "EJECUTANDO" : "SIMULACRO (sin --aplicar no se escribe nada)"}\n`);
  const aCambiar: { id: string; aprobado: boolean }[] = [];
  for (const f of filas) {
    const m = enMeta.get(f.meta_nombre);
    const deberia = m?.status === "APPROVED";
    const estado = !m ? "NO EXISTE en el WABA" : `${m.status} ${m.category}`;
    const marca = deberia === f.meta_aprobado ? "     " : "  <-- ";
    console.log(`  ${String(f.meta_nombre).padEnd(44)} base=${String(f.meta_aprobado).padEnd(5)} meta=${estado}${marca}${deberia === f.meta_aprobado ? "" : `corregir a ${deberia}`}`);
    if (deberia !== f.meta_aprobado) aCambiar.push({ id: f.id, aprobado: deberia });
  }

  console.log(`\nA corregir: ${aCambiar.length}`);
  if (!APLICAR) {
    console.log("\n(dry-run: no se escribio nada. Correr con --aplicar.)");
  } else {
    for (const c of aCambiar) await sql`update plantillas_whatsapp set meta_aprobado = ${c.aprobado} where id = ${c.id}`;
    console.log(`Corregidas: ${aCambiar.length}`);
  }
} finally {
  await sql.end();
}
