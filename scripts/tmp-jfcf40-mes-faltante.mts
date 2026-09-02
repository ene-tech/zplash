// One-off (ago-2026): a JORGE MORENO (JFCF40) le cobraron dos veces el 08-ago
// por dos vías distintas —WooCommerce automático 16:22 $21.990 y mesón 16:59
// $21.990 (Emilio)— y le quedó UN solo mes.
//
// Causa: la venta del mesón fue "Plan nuevo", o sea contratarPlan, que escribe
// `vencimiento = vencimientoPorDefectoISO()` — una fecha fija a un mes de hoy,
// no un ancla sobre el vencimiento existente como hace renovarPlan. Eso pisó
// la fecha que el webhook de WooCommerce acababa de escribir 37 minutos antes.
// El vencimiento guardado (16:59:01) calza exacto con la venta de Emilio.
//
// No es un duplicado a borrar: las dos ventas son plata que el cliente pagó de
// verdad. Lo que falta es el mes, así que se le suma.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-jfcf40-mes-faltante.mts [--aplicar]
import postgres from "postgres";

const PATENTE = "JFCF40";
// Idempotencia: si el vencimiento ya no es este (porque esto ya corrió, o
// porque WooCommerce le renovó de nuevo), no se toca.
const VENC_ESPERADO = "2026-09-07 19:59:01.956+00";

const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  const [c] = await sql`
    SELECT nombre,
           to_char(vencimiento at time zone 'America/Santiago','YYYY-MM-DD HH24:MI') hoy,
           to_char((vencimiento + interval '1 month') at time zone 'America/Santiago','YYYY-MM-DD HH24:MI') nuevo
    FROM clientes WHERE patente = ${PATENTE} AND vencimiento = ${VENC_ESPERADO}::timestamptz`;
  if (!c) {
    console.log(`${PATENTE}: el vencimiento ya no es ${VENC_ESPERADO}. No se toca nada.`);
    process.exit(0);
  }
  console.log(`${PATENTE} (${c.nombre}): vence ${c.hoy} → ${c.nuevo}`);

  if (!aplicar) {
    console.log("\nDRY RUN. Volvé a correr con --aplicar.");
    process.exit(0);
  }

  const [fila] = await sql`
    WITH previo AS (SELECT id, vencimiento FROM clientes WHERE patente = ${PATENTE} AND vencimiento = ${VENC_ESPERADO}::timestamptz),
    actualizado AS (
      UPDATE clientes c SET vencimiento = c.vencimiento + interval '1 month'
      FROM previo WHERE c.id = previo.id
      RETURNING c.id, previo.vencimiento AS antes, c.vencimiento AS despues
    )
    INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario)
    SELECT 'clientes', id, 'update',
           jsonb_build_object('vencimiento', antes), jsonb_build_object('vencimiento', despues),
           'Reparacion manual: pago doble el 08-ago (Woo + meson) que solo dio un mes. contratarPlan piso el vencimiento del webhook.'
    FROM actualizado
    RETURNING registro_id`;
  console.log(fila ? `Mes agregado y auditado (${fila.registro_id}).` : "No se actualizó nada.");
} finally {
  await sql.end();
}
