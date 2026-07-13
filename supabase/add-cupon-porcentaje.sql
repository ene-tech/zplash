-- Corre esto una sola vez en el SQL Editor de Supabase: agrega soporte para
-- descuentos en porcentaje (además de monto fijo) en cupones tipo "descuento".
-- Default false preserva el comportamiento actual (valor = monto fijo en CLP)
-- para todos los cupones existentes.
alter table cupones add column if not exists es_porcentaje boolean not null default false;
