-- HISTÓRICO — ya aplicado, no volver a correr tal cual.
-- La política "anon full access" que crea el paso 1) fue retirada a
-- propósito por supabase/restrict-anon-rls.sql (commit 157982e): el
-- navegador nunca usa PostgREST, todo pasa por Server Actions con
-- DATABASE_URL. Re-ejecutar este archivo completo reabriría ese acceso
-- anónimo de lectura/escritura sobre "empresas". Si necesitas releer qué
-- migraciones se aplicaron acá, hazlo, pero corre restrict-anon-rls.sql
-- después (o salta directo el bloque de policy más abajo).
--
-- Corre esto una sola vez en el SQL Editor de Supabase: junta las migraciones
-- pendientes de aplicar a la base de datos (tabla "empresas" y columna
-- "icono" de perfiles). Es seguro volver a correrlo (usa IF NOT EXISTS),
-- salvo por la policy de RLS mencionada arriba.

-- 1) add-empresas.sql — tabla "empresas" (Administración > Empresas)
create table if not exists empresas (
  id text primary key,
  razon_social text not null,
  rut text not null unique,
  giro text,
  direccion text,
  telefono text,
  contacto_cliente_id text,
  contacto_nombre text,
  creado_en timestamptz not null default now(),
  creado_por text
);

alter table empresas enable row level security;
drop policy if exists "anon full access" on empresas;
create policy "anon full access" on empresas for all to anon using (true) with check (true);

-- 2) add-perfil-icono.sql — ícono/emoji opcional por perfil
alter table perfiles add column if not exists icono text;
