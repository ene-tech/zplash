// Aplica scripts/sql/realinear-ciclo-plan.sql (los mismos dos updates), pero
// antes deja escrito el rollback fila por fila. Todo dentro de UNA transacción:
// si algo falla, no queda nada a medias.
import { appendFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const FILTRO_DESFASE = sql`
  with c as (
    select id,
           (fecha_contratacion at time zone 'America/Santiago')::date fc,
           (vencimiento at time zone 'America/Santiago')::date venc
    from clientes
    where fecha_contratacion is not null
      and (vencimiento at time zone 'America/Santiago')::date >= (now() at time zone 'America/Santiago')::date
  ), d as (
    select c.*, min(abs((c.venc + 1) - (c.fc + (k || ' month')::interval)::date)) desfase
    from c, generate_series(0, 24) k
    group by 1, 2, 3
  )
  select d.id,
    (select ((d.venc + 1) - (k || ' month')::interval)::date
       from generate_series(1, 36) k
      where ((d.venc + 1) - (k || ' month')::interval)::date <= current_date
      order by k asc limit 1) ancla_nueva
  from d
  where desfase >= 3`;

try {
  await sql.begin(async (tx) => {
    // PASO 1: reponerle a RBBP85 el mes que la renovación del 21-08 le recortó.
    await tx`update clientes
             set vencimiento = ('2026-09-20 12:00'::timestamp at time zone 'America/Santiago')
             where patente = 'RBBP85'`;

    // Backup de las filas que va a tocar el paso 2 (ya con RBBP85 corregido,
    // que es lo que lo mete en el filtro).
    const antes = await tx`
      select c.id, c.patente, c.fecha_contratacion, c.vencimiento
      from clientes c join (${FILTRO_DESFASE}) o on o.id = c.id
      order by c.patente`;

    const rollback = [
      "-- Rollback del realineo de ciclo (scripts/sql/realinear-ciclo-plan.sql).",
      "-- DÓNDE: Supabase → SQL Editor. Deja a cada cliente exactamente como",
      "-- estaba antes (incluido el vencimiento viejo de RBBP85, 05-09-2026).",
      "",
      ...antes.map(
        (r: any) =>
          `update clientes set fecha_contratacion = ${r.fecha_contratacion ? `'${r.fecha_contratacion.toISOString()}'` : "null"}, ` +
          `vencimiento = '${r.vencimiento.toISOString()}' where id = '${r.id}'; -- ${r.patente}`
      ),
    ].join("\n");
    appendFileSync("scripts/sql/rollback-realinear-ciclo-plan.sql", rollback + "\n", "utf8");

    // PASO 2: realinear el ancla con el mes efectivamente pagado.
    const res = await tx`
      update clientes cl
      set fecha_contratacion = ((o.ancla_nueva + time '12:00') at time zone 'America/Santiago')
      from (${FILTRO_DESFASE}) o
      where o.id = cl.id and o.ancla_nueva is not null`;

    console.log(`backup: ${antes.length} filas -> scripts/sql/rollback-realinear-ciclo-plan.sql`);
    console.log(`UPDATE ${res.count}`);
  });

  const [v] = await sql`
    with c as (
      select id, (fecha_contratacion at time zone 'America/Santiago')::date fc,
             (vencimiento at time zone 'America/Santiago')::date venc
      from clientes where fecha_contratacion is not null
      and (vencimiento at time zone 'America/Santiago')::date >= (now() at time zone 'America/Santiago')::date
    ), d as (
      select c.id, min(abs((c.venc + 1) - (c.fc + (k || ' month')::interval)::date)) desfase
      from c, generate_series(0, 24) k group by 1
    )
    select count(*) vigentes, count(*) filter (where desfase = 0) alineados,
           count(*) filter (where desfase between 1 and 2) desfase_1_o_2,
           count(*) filter (where desfase >= 3) desfase_3_o_mas
    from d`;
  console.log("verificación:", v);

  const [r] = await sql`
    select to_char(fecha_contratacion at time zone 'America/Santiago','DD-MM-YYYY') contrato,
           to_char(vencimiento at time zone 'America/Santiago','DD-MM-YYYY') vence
    from clientes where patente = 'RBBP85'`;
  console.log("RBBP85:", r);
} finally {
  await sql.end();
}
