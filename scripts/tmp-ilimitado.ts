// Informe puntual (SOLO LECTURA): escenario de la base del Plan Ilimitado viejo.
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
const p = (t: string, r: unknown) => console.log("\n== " + t + " ==\n" + JSON.stringify(r, null, 1));
const HOY = sql`(now() at time zone 'America/Santiago')::date`;

const COHORTE = sql`
  select c.* from clientes c
  where c.plan = 'Plan Ilimitado Mensual'
     or exists (select 1 from ventas v where v.cliente_id = c.id and v.plan = 'Plan Ilimitado Mensual')`;

// Siempre se invoca con un fragmento sql`...` (ver los call sites de abajo).
// La unión que tenía antes —PendingQuery<never> | ReturnType<typeof sql>— no
// compila: postgres.js no acepta PendingQuery<never> donde espera un
// Fragment, y el type check del build fallaba por esto.
const ES_WEB = (col: ReturnType<typeof sql>) => sql`(
    ${col} ilike 'Autom%' or ${col} ilike 'Cliente (One%' or ${col} ilike 'Migraci%' or ${col} ilike 'WooCom%')`;

const BASE = sql`
  cohorte as (${COHORTE}),
  renov as (
    select distinct on (v.cliente_id) v.cliente_id, v.fecha, v.tipo, v.creado_por, v.precio
    from ventas v
    where v.es_servicio_adicional = false and (v.tipo ilike '%renovaci%' or v.tipo ilike '%reactivaci%')
    order by v.cliente_id, v.fecha desc
  ),
  d as (
    select c.id, c.nombre, c.patente, c.email, c.telefono, c.origen, c.plan,
           c.vencimiento::date venc, c.fecha_contratacion::date alta,
           c.renovacion_auto_woo_desde is not null woo_auto,
           r.fecha::date ult_renov, r.tipo ult_tipo, r.creado_por ult_por, r.precio ult_precio,
           case when r.cliente_id is null then 'SIN RENOVACIÓN'
                when ${ES_WEB(sql`r.creado_por`)} then 'WEB' else 'LOCAL' end canal,
           case when r.cliente_id is null then 'Sin renovación'
                when r.creado_por ilike 'Automático (Web)%' or r.creado_por ilike 'Migraci%' or r.creado_por ilike 'WooCom%'
                  then 'Web — suscripción WooCommerce vieja'
                when ${ES_WEB(sql`r.creado_por`)} then 'Web — propia (Webpay/Oneclick)'
                else 'Local — mesón' end subcanal,
           (${HOY} - c.vencimiento::date) dias_vencido
    from cohorte c left join renov r on r.cliente_id = c.id
  )`;

async function main() {
  const gracia = (await sql`select dias_gracia_pago_atrasado g from config limit 1`)[0]?.g ?? 4;
  console.log("Hoy (Santiago):", (await sql`select ${HOY} d`)[0].d.toISOString().slice(0, 10), "| días de gracia:", gracia);

  p("1. Cohorte: dónde está el plan hoy", await sql`
    with ${BASE}
    select coalesce(plan,'(sin plan)') plan, count(*), count(*) filter (where origen='WEB') alta_web, count(*) filter (where origen='LOCAL') alta_local
    from d group by 1 order by 2 desc`);

  p("2. Estado del ciclo hoy", await sql`
    with ${BASE}
    select case when venc is null then 'sin vencimiento cargado'
                when venc >= ${HOY} then 'AL DÍA (renovó, ciclo vigente)'
                when dias_vencido <= ${gracia} then 'vencido — dentro del plazo de gracia (' || ${gracia} || ' días)'
                when dias_vencido <= 30 then 'no renovó — vencido 16-30 días'
                when dias_vencido <= 90 then 'no renovó — vencido 31-90 días'
                else 'no renovó — vencido +90 días' end estado,
           count(*), count(*) filter (where origen='WEB') web, count(*) filter (where origen='LOCAL') local
    from d group by 1 order by 2 desc`);

  p("3. AL DÍA — por canal de su última renovación", await sql`
    with ${BASE}
    select subcanal, count(*), max(ult_renov) ultima
    from d where venc >= ${HOY} group by 1 order by 2 desc`);

  p("4. NO RENOVARON (vencidos fuera de gracia) — por canal de su última renovación", await sql`
    with ${BASE}
    select subcanal, count(*), round(avg(dias_vencido)) dias_prom, max(ult_renov) ultima
    from d where venc is not null and dias_vencido > ${gracia} group by 1 order by 2 desc`);

  p("5. EN GRACIA (vencidos, aún recuperables al precio de renovación)", await sql`
    with ${BASE}
    select subcanal, count(*), count(*) filter (where woo_auto) con_cobro_auto_woo
    from d where venc < ${HOY} and dias_vencido <= ${gracia} group by 1 order by 2 desc`);

  p("6. Sin renovación registrada: ¿primer ciclo o nunca volvió?", await sql`
    with ${BASE}
    select case when alta is null then 'sin fecha de alta (carga vieja)'
                when (${HOY} - alta) <= 35 then 'alta últimos 35 días (aún en 1er ciclo)'
                else 'alta hace más de 35 días' end grupo,
           count(*), count(*) filter (where venc >= ${HOY}) al_dia, count(*) filter (where venc < ${HOY}) vencidos
    from d where canal = 'SIN RENOVACIÓN' group by 1 order by 2 desc`);

  p("7. Renovaciones de la cohorte por mes y canal", await sql`
    with cohorte as (${COHORTE})
    select to_char(v.fecha,'YYYY-MM') mes,
      count(*) filter (where ${ES_WEB(sql`v.creado_por`)}) web,
      count(*) filter (where not ${ES_WEB(sql`v.creado_por`)} or v.creado_por is null) local,
      count(*) total, sum(v.precio)::int monto
    from ventas v join cohorte c on c.id = v.cliente_id
    where v.es_servicio_adicional = false and (v.tipo ilike '%renovaci%' or v.tipo ilike '%reactivaci%')
      and v.fecha > now() - interval '7 months'
    group by 1 order by 1`);

  p("8. Desde el corte X5 (18-ago): renovaciones de la cohorte", await sql`
    with cohorte as (${COHORTE})
    select case when ${ES_WEB(sql`v.creado_por`)} then 'WEB' else 'LOCAL' end canal,
           v.tipo, count(distinct v.cliente_id) clientes, sum(v.precio)::int monto
    from ventas v join cohorte c on c.id = v.cliente_id
    where v.es_servicio_adicional = false and (v.tipo ilike '%renovaci%' or v.tipo ilike '%reactivaci%')
      and v.fecha >= '2026-08-18'
    group by 1,2 order by 3 desc`);

  const detalle = await sql`
    with ${BASE}
    select nombre, patente, plan, origen alta_origen, venc vencimiento, dias_vencido,
           case when venc is null then 'sin vencimiento' when venc >= ${HOY} then 'al día'
                when dias_vencido <= ${gracia} then 'en gracia' else 'no renovó' end estado,
           ult_renov ultima_renovacion, ult_tipo tipo_ultima, ult_por registrada_por, canal, subcanal,
           woo_auto cobro_auto_woo, email, telefono
    from d order by (venc >= ${HOY}) desc, venc desc nulls last`;
  const cols = Object.keys(detalle[0]);
  const csv = [cols.join(";"), ...detalle.map((r) => cols.map((k) => {
    const v = (r as Record<string, unknown>)[k];
    return v == null ? "" : String(v instanceof Date ? v.toISOString().slice(0, 10) : v).replace(/;/g, ",");
  }).join(";"))].join("\n");
  writeFileSync("informe-plan-ilimitado-2026-08-26.csv", "﻿" + csv, "utf8");
  console.log("\nCSV: informe-plan-ilimitado-2026-08-26.csv (" + detalle.length + " filas)");
  await sql.end();
}
main();
