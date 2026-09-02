-- Realinea el ancla del ciclo de plan (`fecha_contratacion`) con el mes que el
-- cliente efectivamente pagó (`vencimiento`).
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano).
--
-- POR QUÉ: hasta jul-2026 un cobro que REINICIABA el ciclo (reactivación de un
-- vencido, contratación nueva) escribía el `vencimiento` nuevo pero dejaba
-- `fecha_contratacion` en la fecha vieja. Hoy ya no puede pasar —renovarPlan
-- mueve las dos juntas, ver @/lib/logic/ingresos.ts— pero las filas viejas
-- quedaron con el ancla corrida, y de ahí salen dos daños:
--   1. La ventana de pasadas del Plan X5 (periodoPlan, anclada a
--      `fecha_contratacion`) no coincide con el mes pagado, así que le cuenta
--      al cliente pasadas de ANTES de pagar. Caso RBBP85: pagó el 21-08 y el
--      02-09 el mesón le negó el ingreso con "ya usó las 5 pasadas", porque la
--      ventana [07-08, 07-09) incluía 3 pasadas del 8, 10 y 18 de agosto,
--      hechas cuando todavía tenía el plan ilimitado pagado el 21-07.
--   2. La renovación manual de un cliente Web (vencimientoAnclado) camina los
--      meses DESDE ese ancla vieja, así que le vende un mes y le entrega los
--      días que falten hasta el aniversario viejo. A RBBP85 le dio 15 días.
--
-- CÓMO SE CALCULA EL ANCLA CORRECTA: el borde del ciclo es `vencimiento + 1
-- día` (el mismo criterio que ya usa anclaCicloPlan para las ~389 filas sin
-- `fecha_contratacion`), retrocediendo de mes en mes hasta el último borde que
-- no sea futuro. No se reconstruye desde `ventas` a propósito: esa vía se midió
-- antes y acierta 36% (ver el comentario de anclaCicloPlan).
--
-- ACCURACY MEDIDA (02-09-2026, contra los 180 clientes vigentes cuyo ancla SÍ
-- está alineada, o sea los que ya están bien): la fórmula reproduce su ventana
-- exacta en 177 (98,3%); los 3 restantes son anclas de fin de mes (31-08) donde
-- finCicloPlan no resta el día y la deducción queda 1 día corta. Ninguno de
-- esos 3 entra en el update, porque el filtro solo toma desfases >= 3 días.
--
-- QUÉ NO TOCA: `ingresos`, `ventas`, `plan`, `ilimitado_hasta` ni el
-- `vencimiento` de nadie salvo RBBP85 (paso 1). El historial de pasadas y los
-- cierres de caja quedan exactamente igual. Los desfases de 1-2 días (158
-- clientes) se dejan como están: la mitad son el recorte de fin de mes, no un
-- error, y corregirlos movería la ventana un día sin arreglar nada.

-- ---------------------------------------------------------------------------
-- PASO 0 — MIRAR ANTES DE TOCAR (opcional, no modifica nada).
-- QUÉ RESPONDE: 51 filas con el ancla actual, la nueva, y cuántas pasadas
-- quedan contadas en la ventana antes y después. Ninguna fila con plan X5
-- puede terminar con 5 o más: eso significaría quitarle una pasada pagada.
-- El `case` de RBBP85 simula el paso 1: sin él su ancla se ve alineada (su
-- vencimiento recortado calza con el aniversario viejo) y no aparecería acá.
-- ---------------------------------------------------------------------------
with c as (
  select id, patente, plan,
         (fecha_contratacion at time zone 'America/Santiago')::date fc,
         case when patente = 'RBBP85' then date '2026-09-20'
              else (vencimiento at time zone 'America/Santiago')::date end venc
  from clientes
  where fecha_contratacion is not null and vencimiento >= now()
), d as (
  select c.*, min(abs((c.venc + 1) - (c.fc + (k || ' month')::interval)::date)) desfase
  from c, generate_series(0, 24) k
  group by 1, 2, 3, 4, 5
), v as (
  select d.*,
    (select (d.fc + (k || ' month')::interval)::date
       from generate_series(0, 36) k
      where (d.fc + (k || ' month')::interval)::date <= current_date
      order by k desc limit 1) ini_actual,
    (select ((d.venc + 1) - (k || ' month')::interval)::date
       from generate_series(1, 36) k
      where ((d.venc + 1) - (k || ' month')::interval)::date <= current_date
      order by k asc limit 1) ini_nueva
  from d
  where desfase >= 3
)
select patente, plan, desfase, fc as ancla_actual, ini_nueva as ancla_nueva, venc as vence,
  (select count(*) from ingresos i where i.cliente_id = v.id
     and (i.fecha at time zone 'America/Santiago')::date >= v.ini_actual
     and (i.fecha at time zone 'America/Santiago')::date < (v.ini_actual + interval '1 month')::date) pasadas_antes,
  (select count(*) from ingresos i where i.cliente_id = v.id
     and (i.fecha at time zone 'America/Santiago')::date >= v.ini_nueva
     and (i.fecha at time zone 'America/Santiago')::date <= v.venc) pasadas_despues
from v
order by plan, patente;

-- ---------------------------------------------------------------------------
-- PASO 1 — RBBP85: reponerle el mes que la renovación del 21-08 le recortó.
-- El cobro de ese día ($21.990, "Renovación Web (manual)") movió el
-- vencimiento del 20-08 al 05-09: 16 días por un mes completo. Lo correcto es
-- 20-09 (un mes desde el vencimiento que traía).
-- QUÉ RESPONDE: "UPDATE 1".
-- ---------------------------------------------------------------------------
update clientes
set vencimiento = ('2026-09-20 12:00'::timestamp at time zone 'America/Santiago')
where patente = 'RBBP85';

-- ---------------------------------------------------------------------------
-- PASO 2 — Realinear el ancla de todos los que la tienen corrida >= 3 días.
-- QUÉ RESPONDE: "UPDATE 51" (los 50 del paso 0 más RBBP85, que entra al
-- filtro recién con el vencimiento ya corregido en el paso 1).
-- Es idempotente: al correr de nuevo, esos clientes ya quedan con desfase 0 y
-- el filtro no los toma ("UPDATE 0").
-- ---------------------------------------------------------------------------
with c as (
  select id,
         (fecha_contratacion at time zone 'America/Santiago')::date fc,
         (vencimiento at time zone 'America/Santiago')::date venc
  from clientes
  where fecha_contratacion is not null and vencimiento >= now()
), d as (
  select c.*, min(abs((c.venc + 1) - (c.fc + (k || ' month')::interval)::date)) desfase
  from c, generate_series(0, 24) k
  group by 1, 2, 3
), objetivo as (
  select d.id,
    (select ((d.venc + 1) - (k || ' month')::interval)::date
       from generate_series(1, 36) k
      where ((d.venc + 1) - (k || ' month')::interval)::date <= current_date
      order by k asc limit 1) ancla_nueva
  from d
  where desfase >= 3
)
update clientes cl
set fecha_contratacion = ((o.ancla_nueva + time '12:00') at time zone 'America/Santiago')
from objetivo o
where o.id = cl.id and o.ancla_nueva is not null;

-- ---------------------------------------------------------------------------
-- PASO 3 — VERIFICAR (no modifica nada).
-- QUÉ RESPONDE: una fila con desfase_3_o_mas = 0. Si sale distinto de 0, algo
-- quedó sin realinear y hay que mirarlo antes de dar el tema por cerrado.
-- ---------------------------------------------------------------------------
with c as (
  select id, (fecha_contratacion at time zone 'America/Santiago')::date fc,
         (vencimiento at time zone 'America/Santiago')::date venc
  from clientes where fecha_contratacion is not null and vencimiento >= now()
), d as (
  select c.id, min(abs((c.venc + 1) - (c.fc + (k || ' month')::interval)::date)) desfase
  from c, generate_series(0, 24) k group by 1
)
select count(*) vigentes_con_ancla,
       count(*) filter (where desfase = 0) alineados,
       count(*) filter (where desfase between 1 and 2) desfase_1_o_2,
       count(*) filter (where desfase >= 3) desfase_3_o_mas
from d;
