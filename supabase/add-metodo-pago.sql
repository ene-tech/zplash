-- Corre esto una sola vez en el SQL Editor: agrega las columnas de forma de
-- pago a la tabla ventas que ya existe.
alter table ventas add column if not exists metodo_pago text;
alter table ventas add column if not exists voucher text;
