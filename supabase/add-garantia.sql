-- Corre esto una sola vez en el SQL Editor: agrega la columna es_garantia
-- a la tabla ingresos que ya existe.
alter table ingresos add column if not exists es_garantia boolean not null default false;
