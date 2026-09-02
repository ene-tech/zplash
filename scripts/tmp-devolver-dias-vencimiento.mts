// Devuelve el día (o dos) que el `vencimientoAnclado` viejo le recortó a los
// clientes vigentes: deja `vencimiento` = fecha_contratacion + k meses - 1 día
// (sin restar el día cuando el mes destino es más corto, igual que
// finCicloPlan). Solo mueve la fecha HACIA ADELANTE: a los que quedaron con un
// día de más no se les quita nada. No toca `fecha_contratacion`, así que
// ninguna ventana de pasadas se mueve.
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const OBJETIVO = sql`
  with c as (
    select id, patente,
           (fecha_contratacion at time zone 'America/Santiago')::date fc,
           (vencimiento at time zone 'America/Santiago')::date venc
    from clientes
    where fecha_contratacion is not null
      and (vencimiento at time zone 'America/Santiago')::date >= (now() at time zone 'America/Santiago')::date
  ), k as (
    select c.*, g.k,
           case when extract(day from (c.fc + (g.k||' month')::interval)::date) = extract(day from c.fc)
                then (c.fc + (g.k||' month')::interval)::date - 1
                else (c.fc + (g.k||' month')::interval)::date end esperado
    from c, generate_series(1,24) g(k)
  )
  select distinct on (id) id, patente, (esperado - venc) dias
  from k
  where esperado - venc in (1, 2)
  order by id, abs(esperado - venc), k`;

try {
  await sql.begin(async (tx) => {
    const antes = await tx`
      select c.id, c.patente, c.vencimiento, o.dias
      from clientes c join (${OBJETIVO}) o on o.id = c.id
      order by c.patente`;

    writeFileSync(
      "scripts/sql/rollback-devolver-dias-vencimiento.sql",
      [
        "-- Rollback de scripts/tmp-devolver-dias-vencimiento.mts (02-09-2026).",
        "-- DÓNDE: Supabase → SQL Editor. Devuelve el vencimiento anterior a los",
        "-- clientes a los que se les repuso el día que el cálculo viejo les recortó.",
        "",
        ...antes.map(
          (r: any) => `update clientes set vencimiento = '${r.vencimiento.toISOString()}' where id = '${r.id}'; -- ${r.patente} (-${r.dias}d)`
        ),
      ].join("\n") + "\n",
      "utf8"
    );

    const res = await tx`
      update clientes cl
      set vencimiento = cl.vencimiento + (o.dias * interval '1 day')
      from (${OBJETIVO}) o
      where o.id = cl.id`;

    console.log(`backup: ${antes.length} filas -> scripts/sql/rollback-devolver-dias-vencimiento.sql`);
    console.log(`UPDATE ${res.count}`);
  });

  const filas = await sql`
    with c as (
      select id, plan, (fecha_contratacion at time zone 'America/Santiago')::date fc,
             (vencimiento at time zone 'America/Santiago')::date venc
      from clientes
      where fecha_contratacion is not null
        and (vencimiento at time zone 'America/Santiago')::date >= (now() at time zone 'America/Santiago')::date
    ), k as (
      select c.*, g.k,
             case when extract(day from (c.fc + (g.k||' month')::interval)::date) = extract(day from c.fc)
                  then (c.fc + (g.k||' month')::interval)::date - 1
                  else (c.fc + (g.k||' month')::interval)::date end esperado
      from c, generate_series(1,24) g(k)
    ), m as (select distinct on (id) id, (venc - esperado) dif from k order by id, abs(venc - esperado), k)
    select dif, count(*) from m group by 1 order by 1`;
  console.log("desvíos que quedan (dif = vencimiento - regla):", filas);
} finally {
  await sql.end();
}
