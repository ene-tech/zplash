-- Corre esto una sola vez en el SQL Editor. Agrega el módulo de
-- Remuneraciones: la ficha de cada colaborador (rut/cargo/fecha de
-- ingreso/sueldo base, agregados directo a la fila de perfiles existente)
-- y su historial de liquidaciones de sueldo. Ver ColaboradorFicha y
-- LiquidacionSueldo en src/types.ts.

alter table perfiles add column if not exists rut text;
alter table perfiles add column if not exists cargo text;
alter table perfiles add column if not exists fecha_ingreso timestamptz;
alter table perfiles add column if not exists sueldo_base numeric;

create table if not exists liquidaciones_sueldo (
  id text primary key,
  perfil_id text not null references perfiles(id) on delete cascade,
  periodo text not null,
  sueldo_base numeric not null default 0,
  gratificacion numeric not null default 0,
  bonos numeric not null default 0,
  horas_extra numeric not null default 0,
  descuento_afp numeric not null default 0,
  descuento_salud numeric not null default 0,
  descuento_impuesto numeric not null default 0,
  otros_descuentos numeric not null default 0,
  total_liquido numeric not null default 0,
  fecha_pago timestamptz not null,
  documento_url text,
  documento_nombre text,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists liquidaciones_sueldo_perfil_id_idx on liquidaciones_sueldo (perfil_id);
create index if not exists liquidaciones_sueldo_periodo_idx on liquidaciones_sueldo (periodo desc);

-- RLS: mismo criterio que el resto de las tablas (ver supabase/schema.sql) —
-- toda la escritura pasa por Server Actions con DATABASE_URL, que se salta
-- RLS, así que no se le da ninguna política al rol anon.
alter table liquidaciones_sueldo enable row level security;
drop policy if exists "anon full access" on liquidaciones_sueldo;

-- Bucket de Storage para adjuntar el documento de una liquidación de sueldo.
-- Público igual que comprobantes-gastos: no hay login por colaborador
-- todavía, así que no se puede restringir la URL a "solo su ficha" a nivel
-- de Storage sin Supabase Auth (queda pendiente para cuando exista).
insert into storage.buckets (id, name, public)
values ('liquidaciones-sueldo', 'liquidaciones-sueldo', true)
on conflict (id) do nothing;

drop policy if exists "anon full access liquidaciones-sueldo" on storage.objects;
create policy "anon full access liquidaciones-sueldo" on storage.objects
  for all to anon
  using (bucket_id = 'liquidaciones-sueldo')
  with check (bucket_id = 'liquidaciones-sueldo');
