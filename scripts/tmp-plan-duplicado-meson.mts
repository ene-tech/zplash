// One-off (ago-2026): repara los 6 pares de "dos planes al mismo cliente en
// minutos" que resultaron ser el clic de más del operador (ver
// MINUTOS_BLOQUEO_PLAN_DUPLICADO en @/lib/helpers, el bloqueo que evita que
// vuelva a pasar).
//
// Fase 1 — borra la venta SOBRANTE de cada par. El cliente pagó una sola vez,
// así que se conserva la MÁS BARATA del par (empate → la primera).
//
// Fase 2 — le quita el mes de más a los 3 clientes donde el segundo clic sí
// corrió la fecha. Solo pasa cuando la venta sobrante fue una renovación o
// reactivación: renovarPlan ancla +1 mes sobre el vencimiento recién escrito,
// mientras que contratarPlan (los pares de "Plan nuevo") escribe
// vencimientoPorDefectoISO() y por eso ahí el segundo clic no suma nada.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-plan-duplicado-meson.mts [--aplicar]
// Deja respaldo-plan-duplicado.json (rollback: reinsertar esas filas en
// `ventas` y sumarle de vuelta el mes a los 3 clientes).
import { writeFileSync } from "node:fs";
import postgres from "postgres";

// La sobrante de cada par, ya elegida con la regla "se queda la más barata".
const A_BORRAR = [
  { id: "v1783440294674", patente: "HBXZ38" }, // 07-jul, 2º "Plan nuevo" $21.990 (Juan, 38s después)
  { id: "v1783526376581", patente: "JPBX89" }, // 08-jul, 2º "Plan nuevo" $21.990 (Cristian, 4 min después)
  { id: "v1785175747370", patente: "PRBP86" }, // 27-jul, 2º "Plan nuevo" $21.990 (Patricio, 94s después)
  { id: "v1786890770100", patente: "TYXB79" }, // 16-ago, 2ª "Renovación preferencial" $21.990 (26s después)
  { id: "v1787091016117", patente: "PRYV45" }, // 18-ago, "Plan nuevo" $29.990 — se queda la renovación de $21.990
  { id: "v1787932229072", patente: "VYPY77" }, // 28-ago, "Renovación preferencial" $21.990 — se queda la reactivación de $20.990
];

// Los 3 a los que el clic de más les sumó un mes. El vencimiento esperado va
// escrito para que el UPDATE sea idempotente: si la fecha ya no es esa (porque
// esto ya corrió, o porque el cliente renovó después), no se toca. Restar un
// mes es el inverso exacto del sumarMesesFecha(base, 1) que hizo renovarPlan,
// y ninguna de las 3 cae en un borde de mes corto.
const MES_DE_MAS = [
  { patente: "PRYV45", venc: "2026-10-17 21:10:16.114+00" }, // 17-10 → 17-09
  { patente: "TYXB79", venc: "2026-10-17 13:01:17.484+00" }, // 17-10 → 17-09
  { patente: "VYPY77", venc: "2026-10-27 14:47:37.392+00" }, // 27-10 → 27-09
];

const TIPOS_PLAN = [
  "Plan nuevo", "Renovación preferencial", "Renovación atrasada", "Reactivación promocional",
  "Renovación Web (manual)", "Plan nuevo (Web)", "Renovación (Web)", "Renovación anticipada (Web)",
  "Reactivación promocional (Web)", "Upgrade a Plan X5 (Web)", "Renovación automática (Oneclick)",
  "Renovación anticipada (Oneclick)", "Reactivación promocional (Oneclick)", "Upgrade a Plan X5 (Oneclick)",
];

const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

try {
  console.log("== Fase 1: ventas duplicadas ==");
  const respaldo = [];
  for (const { id, patente } of A_BORRAR) {
    const [v] = await sql`SELECT * FROM ventas WHERE id = ${id} AND patente = ${patente}`;
    if (!v) {
      console.log(`- ${patente} ${id}: ya no existe, se salta.`);
      continue;
    }
    // El par tiene que seguir estando: si la venta que se conserva no está,
    // borrar esta dejaría al cliente sin ninguna venta de su plan.
    const [pareja] = await sql`
      SELECT id, tipo, precio FROM ventas
      WHERE cliente_id = ${v.cliente_id} AND id <> ${id}
        AND fecha BETWEEN ${v.fecha}::timestamptz - interval '15 minutes' AND ${v.fecha}::timestamptz + interval '15 minutes'
        AND tipo = ANY(${TIPOS_PLAN})
      ORDER BY precio, fecha LIMIT 1`;
    if (!pareja) throw new Error(`${patente} ${id}: no se encontró la venta pareja. Abortado sin borrar nada.`);
    if (Number(pareja.precio) > Number(v.precio)) {
      throw new Error(`${patente} ${id}: la que se conserva ($${pareja.precio}) es MÁS CARA que la que se borra ($${v.precio}). Abortado.`);
    }
    // Cobros Transbank colgando de esta venta: si los hubiera, esto no fue un
    // tipeo del mesón y no corresponde borrarla acá.
    const [{ hijos }] = await sql`
      SELECT (SELECT count(*) FROM pagos_webpay WHERE venta_id = ${id})
           + (SELECT count(*) FROM pagos_webpay_items WHERE venta_id = ${id})
           + (SELECT count(*) FROM cobros_oneclick WHERE venta_id = ${id}) AS hijos`;
    if (Number(hijos) > 0) throw new Error(`${patente} ${id}: tiene ${hijos} pago(s) Transbank asociados. Abortado.`);

    console.log(`- ${patente}: borra ${v.tipo} $${v.precio} (${id}) · conserva ${pareja.tipo} $${pareja.precio}`);
    respaldo.push(v);
  }
  console.log(`${respaldo.length} venta(s), $${respaldo.reduce((s, v) => s + Number(v.precio), 0).toLocaleString("es-CL")} de ingreso fantasma.`);

  console.log("\n== Fase 2: mes de más ==");
  for (const { patente, venc } of MES_DE_MAS) {
    const [c] = await sql`
      SELECT to_char(vencimiento at time zone 'America/Santiago','YYYY-MM-DD') hoy,
             to_char((vencimiento - interval '1 month') at time zone 'America/Santiago','YYYY-MM-DD') nuevo
      FROM clientes WHERE patente = ${patente} AND vencimiento = ${venc}::timestamptz`;
    console.log(c ? `- ${patente}: vence ${c.hoy} → ${c.nuevo}` : `- ${patente}: la fecha ya no es la esperada, no se toca.`);
  }

  if (!aplicar) {
    console.log("\nDRY RUN. Volvé a correr con --aplicar.");
    process.exit(0);
  }

  writeFileSync("respaldo-plan-duplicado.json", JSON.stringify(respaldo, null, 2));
  // Borrado + rastro en el mismo statement: `auditoria` se escribe a nivel de
  // app (ver commit() en AppContext) y no ve una edición manual como esta.
  if (respaldo.length) {
    const filas = await sql`
      WITH borradas AS (DELETE FROM ventas WHERE id = ANY(${respaldo.map((v) => v.id)}) RETURNING *)
      INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, usuario)
      SELECT 'ventas', id, 'delete', to_jsonb(borradas),
             'Reparacion manual: venta de plan duplicada por doble clic del operador. El cliente pago una sola vez.'
      FROM borradas
      RETURNING registro_id`;
    console.log(`\nVentas borradas y auditadas: ${filas.length}`);
  }

  for (const { patente, venc } of MES_DE_MAS) {
    const [fila] = await sql`
      WITH previo AS (SELECT id, vencimiento FROM clientes WHERE patente = ${patente} AND vencimiento = ${venc}::timestamptz),
      actualizado AS (
        UPDATE clientes c SET vencimiento = c.vencimiento - interval '1 month'
        FROM previo WHERE c.id = previo.id
        RETURNING c.id, previo.vencimiento AS antes, c.vencimiento AS despues
      )
      INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario)
      SELECT 'clientes', id, 'update',
             jsonb_build_object('vencimiento', antes), jsonb_build_object('vencimiento', despues),
             'Reparacion manual: mes de mas por venta de plan duplicada (doble clic del operador).'
      FROM actualizado
      RETURNING registro_id`;
    console.log(fila ? `- ${patente}: vencimiento retrocedido un mes.` : `- ${patente}: la fecha ya no es la esperada; no se tocó.`);
  }
} finally {
  await sql.end();
}
