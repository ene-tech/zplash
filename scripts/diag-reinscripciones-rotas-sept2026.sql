-- Suscripciones Oneclick que se apagaron solas por el bug de re-inscripción
-- (arreglado en código el 27-sep-2026, commit "fix: cambiar la tarjeta ya no
-- apaga la renovación automática"). El arreglo evita casos nuevos; las filas
-- que ya quedaron rotas siguen sin cobrarse hasta que se les toque el estado.
--
-- El bug: re-inscribir una tarjeta sobre una suscripción que ya cobraba le
-- bajaba el estado a "pendiente". Si el cliente abandonaba Transbank la fila
-- se quedaba ahí para siempre; si volvía con un rechazo, quedaba "cancelada".
-- El cron solo cobra "activa" y "pausada_validacion_x5", así que en los dos
-- casos la renovación automática se apagó sin que nadie se enterara.
--
-- Cómo se reconoce: la fila tiene `tbk_user` (o sea una tarjeta inscrita de
-- verdad) pero un estado que no cobra. Las bajas legítimas ("Eliminar plan" y
-- "Eliminar tarjeta" en Mi Cuenta, y "Cancelar" en Admin → Suscripciones) no
-- dejan rastro local que las distinga, pero SÍ dan de baja la tarjeta en
-- Transbank, y el bug nunca lo hace. Por eso revivir una baja legítima no
-- puede cobrarle a nadie de más: Transbank rechaza el cargo de una tarjeta
-- borrada. Lo que se pierde en ese caso es una fila "rechazada" en
-- cobros_oneclick (y el aviso de cobro fallido que salga de ahí).
--
-- MEDIDO EL 27-sep-2026 (bloque A corrido en solo lectura con scripts/q.mts):
-- 12 filas — 8 con el plan al día y 4 vencidas. Ninguna de las 12 pagó un plan
-- por otra vía desde que se rompió, o sea nadie reemplazó el cobro automático
-- por el mesón: simplemente dejaron de pagar. Tres traen la huella exacta del
-- bug (se rompieron 1 minuto después de su cobro aprobado: KDXZ75, LPTK70,
-- VXHY28) y dos más a los 5 y 17 minutos (SFVH51, LTPK35).
-- Vencidas, para decidir de a una y avisando antes: KCHL95, LTPK35, SBVJ21,
-- SFVH51.

-- Tipos de venta que cuentan como pago de plan (mismo set que TIPOS_VENTA_PLAN
-- en src/lib/helpers/ventas.ts; si allá se agrega uno, agregarlo acá).
with tipos_plan(tipo) as (values
  ('Plan nuevo'), ('Renovación preferencial'), ('Renovación atrasada'), ('Reactivación promocional'),
  ('Renovación Web (manual)'), ('Plan nuevo (Web)'), ('Renovación (Web)'), ('Renovación anticipada (Web)'),
  ('Reactivación promocional (Web)'), ('Upgrade a Plan X5 (Web)'), ('Renovación automática (Oneclick)'),
  ('Renovación anticipada (Oneclick)'), ('Reactivación promocional (Oneclick)'), ('Upgrade a Plan X5 (Oneclick)')
),

-- ===========================================================================
-- BLOQUE A — DIAGNÓSTICO (solo lectura, no escribe nada)
-- ===========================================================================
-- Responde: qué suscripciones tienen tarjeta inscrita y no cobran, desde
-- cuándo, si el cliente está al día o vencido, si el corte pasó justo después
-- de un cobro aprobado (la huella del bug) y si desde entonces pagó por otra
-- vía (si pagó, el cobro automático no es lo que lo sostiene).
--
-- Columnas clave:
--   plan_hoy     AL DIA  = el cron no le cobraría nada hoy; revivirla no mueve
--                          plata, solo reagenda el cobro a su vencimiento
--                VENCIDO = revivirla le cobra en la pasada siguiente
--   minutos_tras_cobro  minutos entre su último cobro aprobado y el momento en
--                       que la fila se rompió; un número chico es la huella
--                       del bug (el cliente pagó y volvió a inscribir)
--   pago_despues  cómo pagó su plan desde que se rompió; vacío = no pagó nada
--   diagnostico   "baja deliberada" = además borró su plan, no tocar
--   cobra_woo     todavía le cobra WooCommerce: NO revivir, se cobraría doble
--   sin_fecha     proximo_cobro nulo: con el estado arreglado igual no cobra,
--                 hay que ponerle fecha (el bloque B lo hace)
ultimo_cobro as (
  select distinct on (suscripcion_id) suscripcion_id, estado, monto, creado_en
  from cobros_oneclick
  order by suscripcion_id, creado_en desc
),
ultimo_aprobado as (
  select distinct on (suscripcion_id) suscripcion_id, creado_en
  from cobros_oneclick
  where estado = 'aprobada'
  order by suscripcion_id, creado_en desc
)
select
  s.patente,
  c.nombre,
  s.estado,
  case
    when c.plan is null and c.vencimiento is null then 'baja deliberada (borró su plan)'
    when c.renovacion_auto_woo_desde is not null then 'ojo: todavía cobra Woo'
    else 'candidato'
  end                                                                as diagnostico,
  case when c.vencimiento > now() then 'AL DIA' else 'VENCIDO' end   as plan_hoy,
  (c.vencimiento at time zone 'America/Santiago')::date              as vence,
  c.plan,
  coalesce(s.card_tipo, '') || ' ****' || coalesce(s.card_ultimos_digitos, '?') as tarjeta,
  (s.actualizado_en at time zone 'America/Santiago')::date           as se_rompio,
  round(extract(epoch from (s.actualizado_en - ua.creado_en)) / 60)  as minutos_tras_cobro,
  uc.estado                                                          as ultimo_cobro_estado,
  (uc.creado_en at time zone 'America/Santiago')::date               as ultimo_cobro_fecha,
  uc.monto                                                           as ultimo_cobro_monto,
  coalesce((
    select string_agg(distinct v.tipo, ', ')
    from ventas v
    where v.patente = s.patente
      and v.fecha > s.actualizado_en
      and not v.es_servicio_adicional
      and v.tipo in (select tipo from tipos_plan)
  ), '')                                                             as pago_despues,
  (s.proximo_cobro is null)                                          as sin_fecha,
  (c.renovacion_auto_woo_desde is not null)                          as cobra_woo,
  c.email,
  c.telefono
from suscripciones_oneclick s
left join clientes c         on c.patente = s.patente
left join ultimo_cobro uc    on uc.suscripcion_id = s.id
left join ultimo_aprobado ua on ua.suscripcion_id = s.id
where s.tbk_user is not null
  and s.estado in ('cancelada', 'pendiente', 'pendiente_solo_tarjeta')
order by
  case when c.plan is null and c.vencimiento is null then 2 else 1 end,
  case when c.vencimiento > now() then 1 else 2 end,
  s.actualizado_en desc;

-- ===========================================================================
-- BLOQUE B — REPARACIÓN de los que están AL DÍA (escribe; pegar después de
-- mirar el bloque A)
-- ===========================================================================
-- Toca SOLO suscripciones_oneclick, y solo las filas de clientes al día: para
-- esos el cron no cobra nada hoy (ve el vencimiento en el futuro y se limita a
-- reagendar), así que revivirlas no le mueve plata a nadie — vuelven a cobrar
-- recién en su vencimiento, que es justamente lo que el cliente contrató al
-- dejar su tarjeta.
-- No toca: clientes, ventas, cobros_oneclick, ni nada de WooCommerce.
-- Deja fuera a los que borraron su plan, a los que todavía cobra Woo y a los
-- vencidos (esos van de a uno, avisando antes).
--
-- B1. Respaldo para poder deshacer (crea una tabla nueva, no toca las demás):
create table if not exists _backup_reinscripciones_sept2026 as
select s.id, s.patente, s.estado, s.proximo_cobro, now() as respaldado_en
from suscripciones_oneclick s
join clientes c on c.patente = s.patente
where s.tbk_user is not null
  and s.estado in ('cancelada', 'pendiente', 'pendiente_solo_tarjeta')
  and c.vencimiento > now()
  and c.plan is not null
  and c.renovacion_auto_woo_desde is null;

-- B2. El arreglo. `proximo_cobro` queda en el vencimiento real del plan: es el
-- mismo criterio del código (ver /api/pagos/oneclick/cobrar y la rama "solo
-- tarjeta" de /inscripcion/retorno), y hace falta porque con la fecha en nulo
-- el cron no mira la fila aunque el estado esté bien.
update suscripciones_oneclick s
set estado = 'activa',
    proximo_cobro = c.vencimiento,
    actualizado_en = now()
from clientes c
where c.patente = s.patente
  and s.tbk_user is not null
  and s.estado in ('cancelada', 'pendiente', 'pendiente_solo_tarjeta')
  and c.vencimiento > now()
  and c.plan is not null
  and c.renovacion_auto_woo_desde is null
returning s.patente, c.nombre, (c.vencimiento at time zone 'America/Santiago')::date as cobra_el;

-- ===========================================================================
-- BLOQUE C — DESHACER (solo si hace falta)
-- ===========================================================================
update suscripciones_oneclick s
set estado = b.estado,
    proximo_cobro = b.proximo_cobro,
    actualizado_en = now()
from _backup_reinscripciones_sept2026 b
where b.id = s.id;
