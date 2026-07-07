-- ZPlash · esquema Supabase (migración desde Firebase/Firestore)
-- Correr una sola vez en el SQL Editor del proyecto de Supabase.

create table if not exists clientes (
  id text primary key,
  nombre text not null,
  patente text not null unique,
  telefono text,
  email text,
  vehiculo text,
  plan text,
  tipo_documento text,
  razon_social text,
  rut text,
  direccion text,
  giro text,
  vencimiento timestamptz,
  fecha_contratacion timestamptz,
  visitas integer not null default 0,
  ultima_visita timestamptz,
  ultima_renovacion timestamptz,
  creado_en timestamptz not null default now()
);

-- cliente_id es informativo (sin foreign key estricta): en Firestore nunca
-- hubo integridad referencial, así que hay ingresos/ventas históricos que
-- pueden apuntar a un cliente que ya fue eliminado. Se mantiene así a
-- propósito para no perder ese historial ni bloquear la migración.
create table if not exists ingresos (
  id text primary key,
  cliente_id text,
  patente text not null,
  nombre text not null,
  fecha timestamptz not null default now(),
  plan_estado_al_ingreso text not null,
  operador text
);
create index if not exists ingresos_fecha_idx on ingresos (fecha desc);
create index if not exists ingresos_cliente_idx on ingresos (cliente_id);

create table if not exists ventas (
  id text primary key,
  cliente_id text,
  patente text not null,
  nombre text not null,
  plan text not null default '',
  precio numeric not null default 0,
  tipo text not null,
  fecha timestamptz not null default now(),
  operador text,
  metodo_pago text,
  voucher text
);
create index if not exists ventas_fecha_idx on ventas (fecha desc);
create index if not exists ventas_cliente_idx on ventas (cliente_id);

create table if not exists operadores (
  id text primary key,
  nombre text not null unique,
  clave text not null
);

create table if not exists precios (
  plan text primary key,
  normal numeric not null default 0,
  promo numeric not null default 0
);

-- Tabla "singleton" (una sola fila) para configuración global.
create table if not exists config (
  id boolean primary key default true check (id),
  pin_admin text not null default '1234'
);
insert into config (id, pin_admin) values (true, '1234') on conflict (id) do nothing;

-- RLS: esta app no usa Supabase Auth (el PIN de administrador es una
-- validación propia de la aplicación, no de la base de datos), así que
-- habilitamos acceso completo al rol anónimo — el mismo modelo "abierto"
-- que ya tenía el proyecto en Firestore (sin reglas de seguridad).
alter table clientes enable row level security;
alter table ingresos enable row level security;
alter table ventas enable row level security;
alter table operadores enable row level security;
alter table precios enable row level security;
alter table config enable row level security;

create policy "anon full access" on clientes for all to anon using (true) with check (true);
create policy "anon full access" on ingresos for all to anon using (true) with check (true);
create policy "anon full access" on ventas for all to anon using (true) with check (true);
create policy "anon full access" on operadores for all to anon using (true) with check (true);
create policy "anon full access" on precios for all to anon using (true) with check (true);
create policy "anon full access" on config for all to anon using (true) with check (true);
