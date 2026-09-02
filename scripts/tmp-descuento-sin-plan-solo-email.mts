// One-off (ago-2026): recorta el lote "Descuento sin plan - ago 2026" a los
// clientes CON correo. Los sin correo quedaban con un cupón solo-web que nadie
// les podía avisar (no hay campaña de WhatsApp: el único template aprobado en
// Meta para este segmento dice otra oferta), así que se borran en vez de dejar
// $4.000 vivos que el mesón no puede aplicar y el cliente no sabe que tiene.
//
// Solo borra los SIN USAR: uno ya canjeado es plata cobrada, borrarlo
// reescribiría la venta.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-descuento-sin-plan-solo-email.mts [--aplicar]
// Deja respaldo-descuento-sin-plan-borrados-2026-08-30.json (rollback: re-INSERT esas filas).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const LOTE = "Descuento sin plan - ago 2026";
const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const sinCorreo = sql`(cl.email IS NULL OR btrim(cl.email) = '')`;
const [antes] = await sql`
  SELECT count(*)::int total,
         count(*) FILTER (WHERE ${sinCorreo} AND c.usado = false)::int a_borrar,
         count(*) FILTER (WHERE ${sinCorreo} AND c.usado)::int sin_correo_ya_usado,
         count(*) FILTER (WHERE NOT ${sinCorreo})::int se_quedan
  FROM cupones c JOIN clientes cl ON cl.patente = c.patente_asignada
  WHERE c.nombre_lote = ${LOTE}`;
console.log(antes);

if (!aplicar) {
  console.log("\n(dry-run) volver a correr con --aplicar para borrar.");
  await sql.end();
  process.exit(0);
}

const borrados = await sql`
  DELETE FROM cupones c
  USING clientes cl
  WHERE cl.patente = c.patente_asignada
    AND c.nombre_lote = ${LOTE}
    AND c.usado = false
    AND (cl.email IS NULL OR btrim(cl.email) = '')
  RETURNING c.*`;
writeFileSync(
  "respaldo-descuento-sin-plan-borrados-2026-08-30.json",
  JSON.stringify({ generadoEn: new Date().toISOString(), lote: LOTE, borrados }, null, 2),
  "utf-8"
);
console.log(`\nBorrados: ${borrados.length}`);

const [ver] = await sql`
  SELECT count(*)::int vivos,
         count(*) FILTER (WHERE cl.email IS NULL OR btrim(cl.email) = '')::int sin_correo
  FROM cupones c JOIN clientes cl ON cl.patente = c.patente_asignada
  WHERE c.nombre_lote = ${LOTE}`;
console.log("Verificación —", ver);
await sql.end();
