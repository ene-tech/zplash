// SOLO LECTURA. Embudo del negocio completo, no solo WhatsApp: dónde se pierde
// plata y dónde está la palanca más grande.
// Uso: npx tsx --env-file=.env.local scripts/diag-negocio.mts
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const p = (t: string, r: unknown) => console.log("\n### " + t + "\n" + JSON.stringify(r, null, 1));

const TIPOS_PLAN = ["Plan nuevo", "Plan nuevo (Web)"];

p("1. Lavado unico -> plan: la conversion de adquisicion (12 meses)", await sql`
  with unicos as (
    select distinct patente, min(fecha) primera
    from ventas where tipo = 'Lavado único' and fecha > now() - interval '12 months' group by patente)
  select count(*)::int patentes_lavado_unico,
         count(*) filter (where exists (
           select 1 from ventas v where v.patente = u.patente
             and v.tipo in ('Plan nuevo','Plan nuevo (Web)') and v.fecha > u.primera))::int compraron_plan_despues
  from unicos u`);

p("2. Recurrentes de lavado unico: cuantas veces vuelven y cuanto gastan", await sql`
  with x as (
    select patente, count(*)::int veces, sum(precio)::int gastado
    from ventas where tipo = 'Lavado único' and fecha > now() - interval '12 months'
    group by patente)
  select case when veces = 1 then '1 vez' when veces = 2 then '2 veces'
              when veces <= 4 then '3-4 veces' when veces <= 7 then '5-7 veces'
              else '8+ veces' end tramo,
         count(*)::int patentes, sum(gastado)::int gastado_total, round(avg(gastado))::int gastado_prom
  from x group by 1 order by min(veces)`);

p("3. Los que ya gastaron MAS que un plan sin tener plan (12 meses)", await sql`
  with x as (
    select v.patente, count(*)::int veces, sum(v.precio)::int gastado
    from ventas v where v.tipo = 'Lavado único' and v.fecha > now() - interval '12 months'
    group by v.patente)
  select count(*)::int patentes, sum(gastado)::int gastaron_en_total,
         count(*) filter (where exists (select 1 from clientes c where c.patente = x.patente and c.telefono is not null))::int con_telefono,
         count(*) filter (where exists (select 1 from clientes c where c.patente = x.patente and c.vencimiento >= now()))::int ya_tienen_plan_hoy
  from x where gastado >= 21990`);

p("4. Retencion: de los planes nuevos por mes, cuantos siguen vigentes hoy", await sql`
  with cohortes as (
    select to_char(date_trunc('month', v.fecha),'YYYY-MM') mes, v.patente, min(v.fecha) inicio
    from ventas v where v.tipo in ('Plan nuevo','Plan nuevo (Web)')
      and v.fecha > now() - interval '12 months'
    group by 1, 2)
  select mes, count(*)::int planes_nuevos,
         count(*) filter (where exists (
           select 1 from clientes c where c.patente = co.patente and c.vencimiento >= now()))::int siguen_vigentes
  from cohortes co group by mes order by mes desc`);

p("5. Penetracion Oneclick entre los que tienen plan vigente", await sql`
  select count(*)::int vigentes,
         count(*) filter (where exists (
           select 1 from suscripciones_oneclick s
            where s.patente = c.patente and s.estado = 'activa' and s.proximo_cobro is not null))::int con_cobro_automatico,
         count(*) filter (where exists (
           select 1 from suscripciones_oneclick s where s.patente = c.patente and s.tbk_user is not null))::int con_tarjeta_guardada
  from clientes c where c.vencimiento >= now()`);

p("6. Uso del plan: pasadas por periodo entre los vigentes (plan = 5 lavados)", await sql`
  with uso as (
    select c.patente,
      (select count(*)::int from ingresos i
        where i.patente = c.patente and i.fecha > now() - interval '30 days') pasadas
    from clientes c where c.vencimiento >= now())
  select case when pasadas = 0 then '0 (no vino)' when pasadas = 1 then '1'
              when pasadas <= 2 then '2' when pasadas <= 4 then '3-4'
              else '5+ (aprovecha el plan)' end tramo,
         count(*)::int clientes
  from uso group by 1 order by min(pasadas)`);

p("7. Pozo dormido: vencidos y hace cuanto", await sql`
  select case when vencimiento >= now() - interval '30 days' then 'vencio hace <1 mes'
              when vencimiento >= now() - interval '90 days' then '1-3 meses'
              when vencimiento >= now() - interval '180 days' then '3-6 meses'
              else 'mas de 6 meses' end tramo,
         count(*)::int clientes,
         count(*) filter (where telefono is not null and telefono <> '+569')::int con_telefono
  from clientes where vencimiento is not null and vencimiento < now()
  group by 1 order by min(vencimiento) desc`);

p("8. Cupones de descuento: emitidos vs usados por lote", await sql`
  select nombre_lote, count(*)::int emitidos,
         count(*) filter (where usado)::int usados,
         count(*) filter (where not usado and fecha_caducidad < now())::int vencidos_sin_usar,
         count(*) filter (where not usado and fecha_caducidad >= now())::int vivos,
         round(avg(valor))::int valor_prom
  from cupones where creado_en > now() - interval '12 months'
  group by 1 order by emitidos desc limit 12`);

p("9. Los que usaron un cupon: se quedaron?", await sql`
  with usaron as (select distinct patente_uso patente, min(fecha_uso) cuando from cupones where usado and patente_uso is not null group by 1)
  select count(*)::int usaron_cupon,
         count(*) filter (where exists (
           select 1 from ventas v where v.patente = u.patente
             and v.tipo in ('Plan nuevo','Plan nuevo (Web)') and v.fecha > u.cuando))::int contrataron_plan_despues,
         count(*) filter (where exists (
           select 1 from ingresos i where i.patente = u.patente and i.fecha > u.cuando))::int volvieron_al_tunel
  from usaron u`);

p("10. Ingresos por tipo de venta, ultimos 180 dias", await sql`
  select case when tipo = 'Lavado único' then 'Lavado unico'
              when tipo in ('Plan nuevo','Plan nuevo (Web)') then 'Plan nuevo'
              when tipo like 'Renovaci%' then 'Renovaciones'
              when tipo like 'Reactivaci%' then 'Reactivaciones'
              else 'Otros' end grupo,
         count(*)::int ventas, sum(precio)::int total
  from ventas where fecha > now() - interval '180 days'
  group by 1 order by total desc`);

await sql.end();
