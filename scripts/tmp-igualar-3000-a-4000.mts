// One-off (ago-2026): los $3.000 del rellamado de WhatsApp que caen en el mismo
// segmento de la campaña de correo (sin plan + con correo) se igualan al lote
// "Descuento sin plan - ago 2026": $4.000, canal web, hasta el 05-sep. Sin esto
// el correo les promete $4.000 al 5 y su cupón es de $3.000 al 1.
//
// Solo los del segmento: a los del mismo lote SIN correo el WhatsApp ya les
// prometió "descuento automático en tu próxima visita" (canal 'ambos'), y
// pasarlos a 'web' les quitaría en silencio algo que no les podemos avisar.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-igualar-3000-a-4000.mts [--aplicar]
// Deja respaldo-igualar-3000-a-4000-2026-08-30.json (rollback: volver valor/canal/caducidad por id).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const enSegmento = sql`
  c.tipo = 'descuento' AND c.usado = false AND c.valor::int = 3000 AND c.fecha_caducidad > now()
  AND cl.vencimiento IS NULL AND cl.email IS NOT NULL AND btrim(cl.email) <> ''`;

const objetivo = await sql`
  SELECT c.id, c.codigo, c.nombre_lote, c.patente_asignada, c.valor, c.canal, c.fecha_caducidad
  FROM cupones c JOIN clientes cl ON cl.patente = c.patente_asignada
  WHERE ${enSegmento} ORDER BY c.codigo`;
console.log(`A igualar (sin plan + con correo): ${objetivo.length}`);

const [fuera] = await sql`
  SELECT count(*)::int n,
         count(*) FILTER (WHERE cl.email IS NULL OR btrim(cl.email) = '')::int sin_correo,
         count(*) FILTER (WHERE cl.vencimiento IS NOT NULL)::int con_plan
  FROM cupones c JOIN clientes cl ON cl.patente = c.patente_asignada
  WHERE c.tipo='descuento' AND c.usado=false AND c.valor::int=3000 AND c.fecha_caducidad > now()
    AND NOT (cl.vencimiento IS NULL AND cl.email IS NOT NULL AND btrim(cl.email) <> '')`;
console.log("Quedan como están:", fuera);

if (!aplicar) {
  console.log("\n(dry-run) volver a correr con --aplicar para escribir.");
  await sql.end();
  process.exit(0);
}

writeFileSync(
  "respaldo-igualar-3000-a-4000-2026-08-30.json",
  JSON.stringify({ generadoEn: new Date().toISOString(), antes: objetivo }, null, 2),
  "utf-8"
);

const actualizados = await sql`
  UPDATE cupones c
  SET valor = 4000, canal = 'web',
      fecha_caducidad = timestamp '2026-09-05 23:59:59' AT TIME ZONE 'America/Santiago'
  FROM clientes cl
  WHERE cl.patente = c.patente_asignada AND ${enSegmento}
  RETURNING c.id`;
console.log(`\nActualizados: ${actualizados.length}`);

const [ver] = await sql`
  SELECT count(*)::int n, count(DISTINCT c.valor)::int valores, count(DISTINCT c.canal)::int canales,
         count(DISTINCT c.fecha_caducidad)::int fechas
  FROM cupones c JOIN clientes cl ON cl.patente = c.patente_asignada
  WHERE c.tipo='descuento' AND c.usado=false AND c.fecha_caducidad > now()
    AND cl.vencimiento IS NULL AND cl.email IS NOT NULL AND btrim(cl.email) <> ''`;
console.log("Verificación segmento completo —", ver);
await sql.end();
