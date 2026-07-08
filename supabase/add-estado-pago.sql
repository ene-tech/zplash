-- Corre esto una sola vez en el SQL Editor: agrega estado de pago y monto
-- cobrado a la tabla ventas, usados por el registro de Servicios Adicionales
-- (pagado 100%, abono 50%, o por pagar).
alter table ventas add column if not exists estado_pago text;
alter table ventas add column if not exists monto_cobrado numeric;
