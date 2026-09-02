// One-off (ago-2026): $4.000 de descuento a todo cliente SIN PLAN (la misma
// definición que planStatus: `vencimiento` en null), vigente hasta el
// 05-sep-2026 y SOLO POR WEB (canal='web') — la campaña los invita a
// suscribirse en la página, no a que el mesón se lo aplique al pasar.
// Hermano de tmp-descuento-vencidos.sql, que cubrió al segmento "Vencido".
//
// No hace falta tocar código: un cupón tipo "descuento" con patente_asignada
// ya lo levanta buscarCuponDescuentoPlan (@/lib/pagos/cuponPlan) y Mi Cuenta
// lo pinta en la VehiculoCard con el precio ya rebajado.
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-descuento-sin-plan.mts [--aplicar]
// Sin --aplicar solo cuenta a quiénes les caería. Con --aplicar deja
// respaldo-descuento-sin-plan-2026-08-30.json con los cupones creados
// (rollback: DELETE FROM cupones WHERE nombre_lote = '<lote>' AND usado = false).
//
// Idempotente: el NOT EXISTS salta a quien ya tiene un descuento vivo, así que
// re-correrlo no duplica (y evita que este cupón tape a uno que vence antes,
// ver cuponDescuentoDePatente).
//
// El `|| cl.patente` del md5 NO es decorativo: sin él el LATERAL no referencia
// la fila externa, Postgres lo evalúa UNA sola vez y todas las filas salen con
// el mismo código (23505). Alfabeto sin 0/O ni 1/I, igual que generarCodigoCupon.
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const LOTE = "Descuento sin plan - ago 2026";
const aplicar = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const objetivo = await sql`
  SELECT cl.patente, cl.origen, cl.email
  FROM clientes cl
  WHERE cl.vencimiento IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM cupones c
      WHERE c.patente_asignada = cl.patente
        AND c.tipo = 'descuento' AND c.usado = false AND c.fecha_caducidad > now())`;

console.log(`Clientes sin plan y sin descuento vivo: ${objetivo.length}`);
const porOrigen = new Map<string, number>();
for (const c of objetivo) porOrigen.set(c.origen, (porOrigen.get(c.origen) || 0) + 1);
for (const [o, n] of porOrigen) console.log(`  ${n}\t${o}`);
console.log(`  con email: ${objetivo.filter((c) => c.email).length}`);

if (!aplicar) {
  console.log("\n(dry-run) volver a correr con --aplicar para escribir.");
  await sql.end();
  process.exit(0);
}

const creados = await sql`
  INSERT INTO cupones (
    id, codigo, nombre_lote, valor, numero_lote, total_lote, fecha_caducidad,
    usado, creado_en, creado_por, tipo, es_porcentaje, patente_asignada, canal
  )
  SELECT
    'c' || (extract(epoch FROM now()) * 1000)::bigint::text || row_number() OVER (ORDER BY cl.patente),
    cod.codigo,
    ${LOTE},
    4000, 1, 1,
    timestamp '2026-09-05 23:59:59' AT TIME ZONE 'America/Santiago',
    false, now(), 'Administrador', 'descuento', false,
    cl.patente,
    'web'
  FROM clientes cl
  CROSS JOIN LATERAL (
    SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(u.b, i) % 32) + 1, 1), '' ORDER BY i) AS codigo
    FROM (SELECT decode(md5(gen_random_uuid()::text || cl.patente), 'hex') AS b) u,
         generate_series(0, 5) AS i
  ) cod
  WHERE cl.vencimiento IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM cupones c
      WHERE c.patente_asignada = cl.patente
        AND c.tipo = 'descuento' AND c.usado = false AND c.fecha_caducidad > now())
  RETURNING id, codigo, patente_asignada, valor, fecha_caducidad, canal`;

writeFileSync(
  "respaldo-descuento-sin-plan-2026-08-30.json",
  JSON.stringify({ generadoEn: new Date().toISOString(), lote: LOTE, cupones: creados }, null, 2),
  "utf-8"
);
console.log(`\nCupones creados: ${creados.length} (respaldo-descuento-sin-plan-2026-08-30.json)`);

const [ver] = await sql`
  SELECT count(*)::int AS n, min(fecha_caducidad) AS caduca,
         count(DISTINCT canal)::int AS canales, min(canal) AS canal, min(valor)::int AS valor
  FROM cupones WHERE nombre_lote = ${LOTE}`;
console.log("Verificación —", ver);
await sql.end();
