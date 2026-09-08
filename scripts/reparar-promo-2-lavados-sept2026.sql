-- Reparación de la Promo 2 Lavados vendida en el mesón el 7 y 8-sep-2026.
-- Pegar en Supabase → SQL Editor, bloque por bloque y en orden. Correr
-- primero el bloque 0 (solo lectura) y confirmar que siguen siendo las mismas
-- filas antes de pegar el 1 y el 2.
--
-- Qué pasó: al vender la promo, commit() mandaba el ingreso del ticket 1 y
-- los 2 tickets nuevos a la vez. Como ingresos.cupon_codigo tiene FK a
-- cupones.codigo, el ingreso se rechazaba (el ticket todavía no existía) y
-- venta + tickets + visita del cliente quedaban grabados igual. El operador
-- veía "no se pudo guardar", la pantalla volvía atrás sin los tickets, y en
-- dos casos (VYLT24, RBYW27) alguien volvió a leer la patente desde otra
-- sesión y apretó "Usar 1 ticket e ingresar" para dejarlo pasar: la misma
-- pasada quemó el ticket 2. Arreglado en el código (commit espera cupones
-- antes que ingresos, ver src/context/AppContext.tsx); esto repara los datos.
--
-- Qué hace:
--   Bloque 1 — VYLT24 y RBYW27: el ingreso que existe (hecho con el ticket 2
--   a 1-5 minutos de la venta) pasa a ser el del ticket 1, con la hora y el
--   operador de la venta; el ticket 2 vuelve a quedar disponible; la visita
--   contada dos veces se descuenta.
--   Bloque 2 — las 9 patentes: inserta el ingreso del ticket 1 que faltaba,
--   con la fecha y el operador en que se canjeó (fecha_uso / operador_uso del
--   ticket). A VYLT24 y RBYW27 no les inserta nada: el bloque 1 ya les dejó
--   ese ingreso.
--
-- Qué no toca: ventas, ningún cliente salvo `visitas` de las 2 patentes del
-- bloque 1, tickets de otras promos o packs.
--
-- Ojo con RBYW27 (MAURICIO): con sus 2 tickets figurando usados, el 8-sep a
-- las 19:10 le vendieron la promo DE NUEVO (2 × 15.990 el mismo día). El
-- bloque 1 solo toca su lote de las 14:23; el de las 19:10 queda como está
-- (ticket 1 usado, ticket 2 disponible). Después de reparar le quedan 2
-- tickets disponibles y 2 cobros: decidir si se le devuelve uno o se le
-- dejan los 2 tickets. Este script no decide eso.

-- ── Bloque 0: diagnóstico (solo lectura) ────────────────────────────────────
-- Esperado ANTES: todos los numero_lote = 1 usados y con 0 ingresos; VYLT24 y
-- RBYW27 además con el numero_lote = 2 usado y 1 ingreso.
-- Esperado DESPUÉS: cada numero_lote = 1 con 1 ingreso; cada numero_lote = 2
-- sin usar y con 0 ingresos.
select k.patente_asignada, k.numero_lote, k.usado, k.fecha_uso, k.operador_uso,
       (select count(*) from ingresos i where i.cupon_codigo = k.codigo) as ingresos
from cupones k
where k.nombre_lote = 'Promo 2 Lavados'
order by k.creado_en, k.numero_lote;

-- ── Bloque 1: VYLT24 y RBYW27 ───────────────────────────────────────────────
begin;

-- El ingreso apunta al ticket 1 del mismo lote (ids `<lote>-1` / `<lote>-2`),
-- con la hora y el operador de la venta.
update ingresos i
set cupon_codigo = k1.codigo,
    fecha = k1.fecha_uso,
    creado_por = k1.operador_uso
from cupones k2
join cupones k1 on k1.id = regexp_replace(k2.id, '-2$', '-1')
where i.cupon_codigo = k2.codigo
  and k2.nombre_lote = 'Promo 2 Lavados'
  and k2.numero_lote = 2
  and k2.patente_asignada in ('VYLT24', 'RBYW27');

-- El ticket 2 vuelve a estar disponible.
update cupones
set usado = false, patente_uso = null, fecha_uso = null, operador_uso = null
where nombre_lote = 'Promo 2 Lavados'
  and numero_lote = 2
  and usado
  and patente_asignada in ('VYLT24', 'RBYW27');

-- La segunda "visita" no existió (la venta ya había sumado una).
update clientes
set visitas = visitas - 1
where patente in ('VYLT24', 'RBYW27')
  and visitas > 0;

commit;

-- ── Bloque 2: ingreso del ticket 1 para las patentes que no lo tienen ───────
-- Mismo id que habría escrito la app ('i' + milisegundos del canje).
-- plan_estado_al_ingreso: la promo solo se vende sin plan vigente, así que
-- sale 'bad' salvo que la ficha tuviera un vencimiento por delante ese día.
insert into ingresos (id, cliente_id, patente, nombre, fecha, plan_estado_al_ingreso, creado_por, via_cupon, cupon_codigo)
select 'i' || (extract(epoch from k.fecha_uso) * 1000)::bigint,
       c.id,
       c.patente,
       c.nombre,
       k.fecha_uso,
       case when c.vencimiento >= k.fecha_uso then 'ok' else 'bad' end,
       k.operador_uso,
       true,
       k.codigo
from cupones k
join clientes c on c.patente = k.patente_asignada
where k.nombre_lote = 'Promo 2 Lavados'
  and k.numero_lote = 1
  and k.usado
  and not exists (select 1 from ingresos i where i.cupon_codigo = k.codigo);

-- Volver a correr el bloque 0 y comparar con el "Esperado DESPUÉS".
