-- Corre esto una sola vez en el SQL Editor: agrega la columna "origen"
-- (WEB o LOCAL) a la tabla clientes que ya existe.
alter table clientes add column if not exists origen text not null default 'LOCAL';
