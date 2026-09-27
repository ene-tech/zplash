-- Lista priorizada de contacto: clientes de MESÓN con plan vencido o por vencer
-- (solo lectura). Correr:  npx tsx --env-file=.env.local scripts/q.mts --json < scripts/lista-vencidos-meson.sql > lista.json
-- Canal = por dónde pagó su ÚLTIMO plan (creado_por, ver esTarjetaWeb), no clientes.origen.
-- 'Migración histórica WooCommerce' se cuenta como web.
-- prioridad: 1 = upgrade en ventana (pagó lavado único hace <240 h: completa 12.000 en mesón)
--            2 = en gracia (vencido ≤ dias_gracia: todavía paga 19.990 y conserva fecha)
--            3 = vence hoy..30-sep sin cobro automático
--            4 = vencido 4-15 días
--            5 = vencido 16-30 días
--            6 = vencido 31-90 días
-- Dentro de cada prioridad: más pasadas en su último período primero (el que usa, vuelve).
with t(tipo) as (select unnest(array['Plan nuevo','Renovación preferencial','Renovación atrasada','Reactivación promocional','Renovación Web (manual)','Plan nuevo (Web)','Renovación (Web)','Renovación anticipada (Web)','Reactivación promocional (Web)','Upgrade a Plan X5 (Web)','Renovación automática (Oneclick)','Renovación anticipada (Oneclick)','Reactivación promocional (Oneclick)','Upgrade a Plan X5 (Oneclick)','Renovación manual'])),
hoy as (select (now() at time zone 'America/Santiago')::date d),
cfg as (select dias_gracia_pago_atrasado g, horas_ventana_upgrade_plan h from config limit 1),
ult as (select distinct on (cliente_id) cliente_id, creado_por, precio, fecha from ventas
        where tipo in (select tipo from t) and not coalesce(es_servicio_adicional,false) order by cliente_id, fecha desc),
b as (
  select c.id, c.patente, c.nombre, c.telefono, c.email, c.precio_plan_heredado,
    (select d from hoy) - (c.vencimiento at time zone 'America/Santiago')::date dias_venc,
    (c.vencimiento at time zone 'America/Santiago')::date vence,
    u.precio ult_precio,
    (select count(*) from ingresos i where i.cliente_id=c.id and i.fecha >= c.vencimiento - interval '1 month' and i.fecha < c.vencimiento) pasadas_ult_periodo,
    (select count(*) from ingresos i where i.cliente_id=c.id and i.fecha >= c.vencimiento) pasadas_post_venc,
    (select max(v.fecha) from ventas v where v.cliente_id=c.id and v.tipo='Lavado único') ult_lavado_unico,
    exists(select 1 from suscripciones_oneclick s where upper(s.patente)=upper(c.patente) and s.estado='activa') oneclick
  from clientes c join ult u on u.cliente_id=c.id
  where c.vencimiento is not null
    and not (u.creado_por like 'Automático%' or u.creado_por like '%(Oneclick)%' or u.creado_por='Migración histórica WooCommerce')
    and coalesce(c.sin_comunicacion_auto,false) = false
)
select case
    when dias_venc > 0 and ult_lavado_unico > now() - make_interval(hours => (select h from cfg)) then 1
    when dias_venc between 1 and (select g from cfg) then 2
    when dias_venc between -3 and 0 and not oneclick then 3
    when dias_venc between 4 and 15 then 4
    when dias_venc between 16 and 30 then 5
    when dias_venc between 31 and 90 then 6 end prioridad,
  patente, nombre, telefono, email, vence, dias_venc, pasadas_ult_periodo, pasadas_post_venc,
  (ult_lavado_unico at time zone 'America/Santiago')::date ult_lavado_unico, ult_precio, precio_plan_heredado,
  case when dias_venc > 0 and ult_lavado_unico > now() - make_interval(hours => (select h from cfg)) then 12000
       when dias_venc <= (select g from cfg) then least(19990, coalesce(nullif(precio_plan_heredado,0), 19990))
       else 21990 end precio_hoy_sin_cupon
from b
where dias_venc between -3 and 90 and length(regexp_replace(coalesce(telefono,''),'[^0-9]','','g')) >= 8
  and not (dias_venc <= 0 and oneclick)
order by prioridad, pasadas_ult_periodo desc, dias_venc
