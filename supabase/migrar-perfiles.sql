-- Unifica `operadores` + `administradores` en una sola tabla `perfiles`.
-- Revisar antes de correr: decide qué CLAVE gana para Evelyn y Juan, que
-- hoy existen en ambas tablas con contraseñas distintas (una de operador,
-- una de administrador). Tal como está, este script deja la clave de
-- ADMINISTRADORES para quien exista en ambas tablas (coalesce admin→operador)
-- — cámbialo si prefieres al revés antes de ejecutar.

create table if not exists perfiles (
  id text primary key,
  nombre text not null unique,
  clave text not null,
  modulos jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now()
);

-- Operadores de piso (Christian, Verónica, Patricio, Emilio, Jota, y
-- Evelyn/Juan si no aparecen en administradores): podían entrar tanto a
-- "Operador" como a "Ingreso Servicios Adicionales" con la misma clave.
insert into perfiles (id, nombre, clave, modulos)
select
  'p-' || o.id,
  o.nombre,
  coalesce(a.clave, o.clave),
  case
    when a.nombre is null then '["operador","servicios"]'::jsonb
    when a.es_gerente then
      '["operador","servicios","clientes","ingresos","cierre","empresa","perfiles","stats","config","contabilidad","permisos"]'::jsonb
    else
      '["operador","servicios","clientes","ingresos","cierre","empresa","perfiles","stats","config"]'::jsonb
  end
from operadores o
left join administradores a on a.nombre = o.nombre
on conflict (nombre) do nothing;

-- Administradores que no tenían cuenta de operador (si los hubiera).
insert into perfiles (id, nombre, clave, modulos)
select
  'p-' || a.id,
  a.nombre,
  a.clave,
  case
    when a.es_gerente then
      '["clientes","ingresos","cierre","empresa","perfiles","stats","config","contabilidad","permisos"]'::jsonb
    else
      '["clientes","ingresos","cierre","empresa","perfiles","stats","config"]'::jsonb
  end
from administradores a
where not exists (select 1 from operadores o where o.nombre = a.nombre)
on conflict (nombre) do nothing;

alter table perfiles enable row level security;
drop policy if exists "anon full access" on perfiles;

-- Una vez verificados los datos migrados (SELECT * FROM perfiles), retirar
-- las tablas viejas a mano:
-- drop view if exists administradores_publicos;
-- drop table if exists operadores;
-- drop table if exists administradores;
