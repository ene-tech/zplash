// One-off (ago-2026): los descuentos de $4.000 de la campaña de plan vencido
// pasan a ser SOLO WEB — el correo/WhatsApp los ofrece por suscribirse en la
// página, así que no corresponde que el mesón los aplique al pasar.
//
// Solo toca los que siguen sin usar: los 30 ya canjeados quedan como están,
// marcarles el canal ahora reescribiría historia (varios se cobraron en local).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-canal-web-4000.mts [--aplicar]
// Sin --aplicar solo muestra a quiénes les caería. Deja respaldo-canal-web-4000.json
// con el canal previo de cada cupón (rollback: volver a poner ese canal por id).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const objetivo = await sql`
  SELECT id, codigo, nombre_lote, patente_asignada, canal
  FROM cupones
  WHERE tipo = 'descuento' AND valor::int = 4000 AND usado = false
  ORDER BY nombre_lote, codigo`;

const porLote = new Map<string, number>();
for (const c of objetivo) porLote.set(c.nombre_lote, (porLote.get(c.nombre_lote) || 0) + 1);
console.log(`Cupones sin usar de $4.000: ${objetivo.length}`);
for (const [lote, n] of porLote) console.log(`  ${n}\t${lote}`);
console.log("canal actual:", [...new Set(objetivo.map((c) => c.canal))].join(", ") || "-");

if (!aplicar) {
  console.log("\n(dry-run) volver a correr con --aplicar para escribir.");
  await sql.end();
  process.exit(0);
}

writeFileSync(
  "respaldo-canal-web-4000.json",
  JSON.stringify({ generadoEn: new Date().toISOString(), antes: objetivo }, null, 2),
  "utf-8"
);

const actualizados = await sql`
  UPDATE cupones SET canal = 'web'
  WHERE tipo = 'descuento' AND valor::int = 4000 AND usado = false AND canal <> 'web'
  RETURNING id`;
console.log(`\nActualizados a canal='web': ${actualizados.length}`);

const [resumen] = await sql`
  SELECT count(*) FILTER (WHERE canal = 'web')::int AS web,
         count(*) FILTER (WHERE canal <> 'web')::int AS resto
  FROM cupones WHERE tipo = 'descuento' AND valor::int = 4000 AND usado = false`;
console.log("Verificación — web:", resumen.web, "· otros:", resumen.resto);
await sql.end();
