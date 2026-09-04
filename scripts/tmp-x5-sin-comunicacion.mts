// Marca sin_comunicacion_auto=true a los clientes del Plan Ilimitado legacy
// con renovación automática Oneclick (activa o pausada por el candado del X5)
// que todavía no firmaron el cambio al X5 — para que las reglas automáticas de
// WhatsApp y correo los salten mientras se les gestiona la firma a mano.
//
// Sin flag: solo lista quiénes quedarían marcados (no toca nada).
// Con --aplicar: hace el update y deja respaldo de los ids en
// respaldo-x5-sin-comunicacion-<fecha>.json (revertir = mismo update en false
// sobre esos ids).
//
// Uso: npx tsx --env-file=.env.local scripts/tmp-x5-sin-comunicacion.mts [--aplicar]
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const APLICAR = process.argv.includes("--aplicar");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const filas = (await sql.unsafe(`
    select c.id, c.patente, c.nombre, c.sin_comunicacion_auto, s.estado
    from clientes c
    join suscripciones_oneclick s on upper(s.patente) = upper(c.patente)
    where c.plan = 'Plan Ilimitado Mensual'
      and s.estado in ('activa', 'pausada_validacion_x5')
      and c.acepto_x5_en is null
    order by c.patente`)) as any[];

  for (const f of filas) {
    console.log(`${f.sin_comunicacion_auto ? "ya marcado" : "a marcar  "} ${f.patente.padEnd(8)} ${f.estado.padEnd(22)} ${f.nombre}`);
  }
  const pendientes = filas.filter((f) => !f.sin_comunicacion_auto);
  console.log(`\n${filas.length} en el segmento, ${pendientes.length} por marcar.`);
  if (!pendientes.length) process.exit(0);
  if (!APLICAR) {
    console.log("Nada tocado. Para marcarlos de verdad: agregar --aplicar");
    process.exit(0);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  writeFileSync(`respaldo-x5-sin-comunicacion-${fecha}.json`, JSON.stringify(pendientes.map((f) => ({ id: f.id, patente: f.patente })), null, 2), "utf8");
  const ids = pendientes.map((f) => f.id);
  const r = await sql`update clientes set sin_comunicacion_auto = true where id in ${sql(ids)}`;
  console.log(`\nListo: ${r.count} clientes marcados. Respaldo: respaldo-x5-sin-comunicacion-${fecha}.json`);
} finally {
  await sql.end();
}
