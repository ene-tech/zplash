-- Corre esto una sola vez en el SQL Editor de Supabase: agrega soporte para
-- cupones de tipo "descuento" (restan un monto del precio a cobrar), sin
-- tocar el comportamiento actual de los cupones "vale" (lavado gratis).
--
-- tipo: 'vale' (comportamiento actual) vs 'descuento' (nuevo, WhatsApp).
-- Default 'vale' preserva las filas existentes sin tocarlas.
alter table cupones add column tipo text not null default 'vale';

-- A qué patente se le regaló el código *antes* de usarlo (distinto de
-- patente_uso, que ya existe y se llena recién al canjear). Nullable
-- porque los cupones "vale" existentes no la usan.
alter table cupones add column patente_asignada text;

-- Mismo patrón que ya existe en ingresos (via_cupon / cupon_codigo) para
-- que Cierre de Caja pueda distinguir ventas con descuento aplicado.
alter table ventas add column via_cupon boolean not null default false;
alter table ventas add column cupon_codigo text references cupones(codigo) on delete set null;
