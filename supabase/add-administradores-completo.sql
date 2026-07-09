-- Corre esto una sola vez en el SQL Editor. Reemplaza a add-administradores.sql
-- y add-seguridad-administradores.sql (ninguno de los dos había corrido
-- realmente: la tabla "administradores" nunca se creó). Este script crea la
-- tabla desde cero YA con el modelo de seguridad correcto: el cliente nunca
-- puede leer la columna "clave", solo la vista pública sin contraseñas. El
-- login y el cambio de contraseña pasan por /api/admin/login y
-- /api/admin/cambiar-clave (server-side, con la service role key).

create table if not exists administradores (
  id text primary key,
  nombre text not null unique,
  clave text not null,
  es_gerente boolean not null default false
);

insert into administradores (id, nombre, clave, es_gerente) values
  ('adm1', 'Evelyn', '1234', false),
  ('adm2', 'Juan', '5678', true)
on conflict (id) do nothing;

alter table administradores enable row level security;

-- A propósito, NO se crea ninguna política para anon sobre esta tabla: con
-- RLS habilitada y sin políticas, el acceso queda denegado por defecto. La
-- service role key (usada solo en las rutas /api/admin/*) se salta RLS.
drop policy if exists "anon full access" on administradores;

create or replace view administradores_publicos as
  select id, nombre, es_gerente from administradores;

grant select on administradores_publicos to anon;

notify pgrst, 'reload schema';
