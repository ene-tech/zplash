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
--    renueva a tiempo en el mesón. Cambia el próximo cobro de 141
--    suscripciones activas sin precio heredado (las 50 con heredado ya
--    pagaban 19.990). No toca ninguna venta pasada. Responde "UPDATE 1".
--    Recontado el 9-sep-2026: 191 activas, 141 sin heredado.
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

-- 5) NO CORRER. Estaba acá para borrarle el precio heredado a los 187 clientes
--    que lo tienen en 19.990, con el argumento de que sin eso "el vencido
--    fuera de gracia sigue pagando 19.990 en vez de 21.990". Ese argumento es
--    falso y quedó verificado el 9-sep-2026 leyendo los seis caminos que
--    consultan precioConHeredado:
--
--    - precioPagoAtrasado FUERA de gracia devuelve precioNormal DIRECTO
--      (precios.ts:462), sin pasar por precioConHeredado. O sea que el vencido
--      ya paga 21.990 después del paso 2, tenga o no heredado. Ese era el
--      único caso que este paso decía arreglar.
--    - precioRenovacionATiempo, cobrarSuscripcion, precioRenovacionLocal (con
--      tramos en {}) y contratacion.mensual comparan el heredado contra 19.990
--      después de los pasos 1 y 2. Como el heredado ES 19.990, la condición
--      `heredado < precioVigente` da falso y devuelven 19.990 igual.
--    - El único lugar donde el heredado todavía muerde es precios.ts:440, y
--      pide `vencimiento` nulo. De los 187, cero lo tienen.
--
--    Correrlo entonces toca 187 filas para no cambiar ni un precio, y de paso
--    tira el dato de quién tenía la tarifa congelada — que es justo lo que los
--    protege si el día de mañana el 19.990 vuelve a subir.
--
--    Si igual se decide borrarlo (por ejemplo al subir el precio base, donde
--    sí pasaría a descontar), va con respaldo:
-- create table if not exists bak_precio_plan_heredado_2026_09 as
--   select id, precio_plan_heredado from clientes where precio_plan_heredado is not null;
-- update clientes set precio_plan_heredado = null where precio_plan_heredado is not null;

-- 6) Verificación: tiene que quedar exactamente esto.
select plan, normal, promo from precios where plan ilike 'Plan%' order by plan;
--   Plan X5                            21990 / 19990
--   Plan X5 (1ra contratación)         21990 / 0
--   Plan X5 (Renovación Automática)    19990 / 0
select tramos_reactivacion_vencido, tramos_renovacion_local from config;   -- {} y {}
select count(*) from clientes where precio_plan_heredado is not null;      -- 187, intacto (ver paso 5)

-- ---------------------------------------------------------------------------
-- DESHACER (solo si hace falta; pegar en este orden)
-- La primera línea solo aplica si se corrió el paso 5, que por defecto no va.
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
