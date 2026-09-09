-- Simplificación de planes (sep-2026). Pegar en Supabase → SQL Editor, paso
-- por paso y en orden. Cada paso dice qué hace, qué responde y cómo se
-- deshace. Todo es idempotente: correrlo dos veces deja lo mismo.
--
-- Contexto (medición del 6-sep-2026): 14 precios distintos de plan en 90
-- días; el cobro automático (Oneclick) cobraba 21.990 y renovar a tiempo en
-- el mesón 19.990; la lista de 24.990 se cobró 6 veces; los tramos de
-- reactivación eran la lista disfrazada (LOCAL 24.990) o la entrada (WEB
-- 21.990). Resultado buscado: un plan (X5) con dos precios —
-- 19.990 renovar a tiempo o por cobro automático, 21.990 entrar o volver
-- después de vencido.

-- 0) Foto de antes (solo lectura). Guardar la respuesta por si hay que deshacer.
select plan, normal, promo from precios where plan ilike 'Plan%' or plan ilike 'Upgrade%' order by plan;
-- Esperado hoy:
--   Plan X5                                          24990 / 19990
--   Plan X5 (1ra contratación)                       21990 / 0
--   Plan X5 (Renovación Automática)                  21990 / 0
--   Plan Ilimitado Mensual                           29990 / 21990
--   Plan Ilimitado Mensual (1ra contratación)        21990 / 0
--   Plan Ilimitado Mensual (Renovación Automática)   21990 / 0
--   Upgrade a Plan Ilimitado                         11990 / 0
select tramos_reactivacion_vencido from config;

-- 1) Oneclick a 19.990: el que inscribe tarjeta paga lo mismo que el que
--    renueva a tiempo en el mesón. Cambia el próximo cobro de ~124
--    suscripciones activas sin precio heredado (las ~50 con heredado ya
--    pagaban 19.990). No toca ninguna venta pasada. Responde "UPDATE 1".
update precios set normal = 19990 where plan = 'Plan X5 (Renovación Automática)';

-- 2) Muere la lista de 24.990: el precio normal del X5 pasa a ser el de
--    entrada. Un vencido fuera de los 10 días de gracia paga 21.990, igual que
--    uno nuevo, en mesón y en web. "Plan X5 (1ra contratación)" ya está en
--    21.990 y se deja: Configuración → Planes lo edita. Responde "UPDATE 1".
update precios set normal = 21990 where plan = 'Plan X5';

-- 3) Fuera los tramos de reactivación de vencidos: con la lista en 21.990 el
--    tramo WEB no descuenta nada y el LOCAL cobraba MÁS que la entrada. Sin
--    tramo, mesón y web le cobran lo mismo a un vencido (precio de pago
--    atrasado: 19.990 dentro de gracia, 21.990 después) y el cupón de campaña
--    se resta encima. Responde "UPDATE 1" (config tiene una sola fila).
update config set tramos_reactivacion_vencido = '{}'::jsonb;

-- 4) Filas del ilimitado viejo: ningún cobro las lee (planVendible cotiza todo
--    al X5) y Configuración → Planes deja de mostrarlas con este cambio.
--    Responde "DELETE 4".
delete from precios where plan in (
  'Plan Ilimitado Mensual',
  'Plan Ilimitado Mensual (1ra contratación)',
  'Plan Ilimitado Mensual (Renovación Automática)',
  'Upgrade a Plan Ilimitado'
);

-- 5) Precio heredado: 187 clientes tienen 19.990 congelado (140 al día). Con
--    los pasos 1 y 2, renovar a tiempo o por Oneclick ya vale 19.990 para
--    todos, así que el heredado no descuenta nada... salvo al que deja vencer
--    el plan fuera de gracia: hoy paga 19.990 en vez de 21.990. Ponerlo en
--    null es lo que hace real la regla "vencido paga entrada". Primero se
--    guarda una copia (tabla bak_precio_plan_heredado_2026_09) para poder
--    deshacer. Responde "SELECT 187" y luego "UPDATE 187".
create table if not exists bak_precio_plan_heredado_2026_09 as
  select id, precio_plan_heredado from clientes where precio_plan_heredado is not null;
update clientes set precio_plan_heredado = null where precio_plan_heredado is not null;

-- 6) Verificación: tiene que quedar exactamente esto.
select plan, normal, promo from precios where plan ilike 'Plan%' order by plan;
--   Plan X5                            21990 / 19990
--   Plan X5 (1ra contratación)         21990 / 0
--   Plan X5 (Renovación Automática)    19990 / 0
select tramos_reactivacion_vencido, tramos_renovacion_local from config;   -- {} y {}
select count(*) from clientes where precio_plan_heredado is not null;      -- 0

-- ---------------------------------------------------------------------------
-- DESHACER (solo si hace falta; pegar en este orden)
-- ---------------------------------------------------------------------------
-- update clientes c set precio_plan_heredado = b.precio_plan_heredado
--   from bak_precio_plan_heredado_2026_09 b where b.id = c.id;
-- insert into precios (plan, normal, promo) values
--   ('Plan Ilimitado Mensual', 29990, 21990),
--   ('Plan Ilimitado Mensual (1ra contratación)', 21990, 0),
--   ('Plan Ilimitado Mensual (Renovación Automática)', 21990, 0),
--   ('Upgrade a Plan Ilimitado', 11990, 0)
--   on conflict (plan) do nothing;
-- update config set tramos_reactivacion_vencido = '{"Plan X5": [{"id": "c1787840730344494", "canal": "LOCAL", "precio": 24990, "visitasMax": 25, "visitasMin": 0, "diasVencidoMax": 600, "diasVencidoMin": 0}, {"id": "c1787843409113803", "canal": "WEB", "precio": 21990, "visitasMax": 25, "visitasMin": 0, "diasVencidoMax": 600, "diasVencidoMin": 0}]}'::jsonb;
-- update precios set normal = 24990 where plan = 'Plan X5';
-- update precios set normal = 21990 where plan = 'Plan X5 (Renovación Automática)';
