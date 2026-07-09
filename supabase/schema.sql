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
  origen text not null default 'LOCAL',
  visitas integer not null default 0,
  ultima_visita timestamptz,
  ultima_renovacion timestamptz,
  creado_en timestamptz not null default now(),
  creado_por text
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
  operador text,
  es_garantia boolean not null default false,
  via_cupon boolean not null default false,
  cupon_codigo text
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
  voucher text,
  hora_entrega text,
  notas text,
  estado_pago text,
  monto_cobrado numeric,
  es_servicio_adicional boolean not null default false,
  tipo_documento text,
  razon_social text,
  rut text,
  direccion text,
  giro text
);
create index if not exists ventas_fecha_idx on ventas (fecha desc);
create index if not exists ventas_cliente_idx on ventas (cliente_id);

create table if not exists operadores (
  id text primary key,
  nombre text not null unique,
  clave text not null
);

-- Credenciales de ADMINISTRACIÓN por persona. Juan es el gerente
-- (es_gerente = true): puede cambiar la contraseña de cualquiera;
-- Evelyn solo puede cambiar la suya propia (regla aplicada en la app).
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

create table if not exists precios (
  plan text primary key,
  normal numeric not null default 0,
  promo numeric not null default 0
);

create table if not exists cupones (
  id text primary key,
  codigo text not null unique,
  nombre_lote text not null,
  valor numeric not null default 0,
  numero_lote integer not null default 1,
  total_lote integer not null default 1,
  fecha_caducidad timestamptz not null,
  usado boolean not null default false,
  patente_uso text,
  fecha_uso timestamptz,
  operador_uso text,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists cupones_codigo_idx on cupones (codigo);

-- Modulo de Contabilidad: registro manual de ingresos, egresos, cuentas por
-- cobrar y cuentas por pagar. Es la base para construir libro mayor / EERR
-- mas adelante.
create table if not exists movimientos_contables (
  id text primary key,
  tipo text not null,
  fecha timestamptz not null default now(),
  descripcion text not null,
  categoria text,
  contraparte text,
  rut_proveedor text,
  numero_factura text,
  tipo_documento text,
  monto numeric not null default 0,
  estado text not null default 'pendiente',
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists movimientos_contables_fecha_idx on movimientos_contables (fecha desc);
create index if not exists movimientos_contables_tipo_idx on movimientos_contables (tipo);

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
alter table administradores enable row level security;
alter table precios enable row level security;
alter table config enable row level security;
alter table cupones enable row level security;
alter table movimientos_contables enable row level security;

create policy "anon full access" on clientes for all to anon using (true) with check (true);
create policy "anon full access" on ingresos for all to anon using (true) with check (true);
create policy "anon full access" on ventas for all to anon using (true) with check (true);
create policy "anon full access" on operadores for all to anon using (true) with check (true);
create policy "anon full access" on administradores for all to anon using (true) with check (true);
create policy "anon full access" on precios for all to anon using (true) with check (true);
create policy "anon full access" on config for all to anon using (true) with check (true);
create policy "anon full access" on cupones for all to anon using (true) with check (true);
create policy "anon full access" on movimientos_contables for all to anon using (true) with check (true);
