-- Asientos contables que faltaban para los reembolsos con tarjeta hechos antes
-- del fix (reembolsarVenta no escribía asiento): el EERR los seguía contando
-- como ingreso. Al 21-oct-2026 eran 6, por -$109.950, del 4-sep al 14-oct,
-- todos de planes cobrados por Oneclick ("Servicios de Lavado / Túnel").
-- Crea un ingreso negativo por cada uno, con la fecha del reembolso y el mismo
-- id que usa el código nuevo (mc-venta-reembolso-<venta>), así no se duplica.
-- Cambia el EERR de septiembre y octubre: es la corrección.
-- Pegar DESPUÉS del deploy del fix (si no, un reembolso hecho entre medio
-- queda sin asiento hasta volver a correr esto; es idempotente).

-- 0) Antes: deberían salir 6 filas.
select v.id, v.fecha::date, v.precio, v.nombre, v.patente
from ventas v
where v.tipo = 'Reembolso' and v.creado_por = 'Automático (Reembolso)'
  and not exists (select 1 from movimientos_contables m where m.venta_id = v.id or m.id = 'mc-venta-' || v.id);

-- 1) El cambio.
insert into movimientos_contables (id, tipo, fecha, descripcion, categoria, contraparte, monto, estado, metodo_pago, fecha_pago, creado_en, creado_por, venta_id)
select 'mc-venta-' || v.id, 'ingreso', v.fecha,
       'Reembolso de ' || coalesce(o.tipo, 'venta') || ' – ' || v.nombre || coalesce(' (' || nullif(v.patente, '') || ')', ''),
       coalesce(mo.categoria, case when o.tipo = 'Venta de productos' then 'Venta de Productos' else 'Servicios de Lavado / Túnel' end),
       v.nombre, v.precio, 'pagado', 'tarjeta', v.fecha, now(), 'Regularización reembolsos 2026-10-21', v.id
from ventas v
left join ventas o on o.id = substr(v.id, 11)
left join movimientos_contables mo on mo.id = 'mc-venta-' || substr(v.id, 11)
where v.tipo = 'Reembolso' and v.creado_por = 'Automático (Reembolso)'
  and not exists (select 1 from movimientos_contables m where m.venta_id = v.id or m.id = 'mc-venta-' || v.id)
on conflict (id) do nothing;

-- 2) Después: el paso 0 debe devolver 0 filas.

-- Deshacer:
-- delete from movimientos_contables where creado_por = 'Regularización reembolsos 2026-10-21';
