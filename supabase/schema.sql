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

-- Vista pública sin la columna clave: es lo único que el cliente (anon)
-- puede leer de administradores, para poder mostrar el selector "¿Quién
-- eres?" sin exponer las contraseñas. El login y el cambio de contraseña
-- corren server-side (rutas /api/admin/*) usando la service role key.
create or replace view administradores_publicos as
  select id, nombre, es_gerente from administradores;

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
  documento_url text,
  documento_nombre text,
  monto numeric not null default 0,
  estado text not null default 'pendiente',
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists movimientos_contables_fecha_idx on movimientos_contables (fecha desc);
create index if not exists movimientos_contables_tipo_idx on movimientos_contables (tipo);

-- Restricciones a nivel de base de datos que reflejan los union types de
-- TypeScript: sin esto, nada impedía guardar un "tipo" o "estado" inválido
-- (o una combinación imposible, como un cuenta_por_cobrar con estado
-- "x_rendir") insertando directo contra la API de Supabase.
alter table movimientos_contables drop constraint if exists movimientos_contables_tipo_check;
alter table movimientos_contables add constraint movimientos_contables_tipo_check
  check (tipo in ('ingreso', 'egreso', 'cuenta_por_cobrar'));

alter table movimientos_contables drop constraint if exists movimientos_contables_estado_check;
alter table movimientos_contables add constraint movimientos_contables_estado_check
  check (
    (tipo = 'egreso' and estado in ('pagado_cc', 'x_rendir', 'pendiente_pago'))
    or (tipo <> 'egreso' and estado in ('pagado', 'pendiente'))
  );

alter table movimientos_contables drop constraint if exists movimientos_contables_tipo_documento_check;
alter table movimientos_contables add constraint movimientos_contables_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('Boleta', 'Factura'));

-- Plan de cuentas editable para Egresos/Gastos (ver GRUPOS_GASTO_EERR en
-- helpers.ts): los 5 grupos son fijos porque son la estructura del EERR,
-- pero las glosas dentro de cada grupo se administran desde Configuración.
create table if not exists categorias_gasto (
  id text primary key,
  nombre text not null unique,
  grupo text not null,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists categorias_gasto_grupo_idx on categorias_gasto (grupo);

alter table categorias_gasto drop constraint if exists categorias_gasto_grupo_check;
alter table categorias_gasto add constraint categorias_gasto_grupo_check
  check (grupo in (
    'Otros Costos Directos',
    'Gasto de Remuneraciones',
    'Gastos de Administración',
    'Gastos Financieros Bancarios',
    'Otros Egresos Fuera de la Explotación'
  ));

insert into categorias_gasto (id, nombre, grupo) values
  ('cg-comisiones-por-venta', 'Comisiones por Venta', 'Otros Costos Directos'),
  ('cg-insumos-de-lavado', 'Insumos de Lavado', 'Otros Costos Directos'),
  ('cg-mantencion-maquinarias', 'Mantención de Maquinarias', 'Otros Costos Directos'),
  ('cg-mantencion-instalaciones', 'Mantención de Instalaciones', 'Otros Costos Directos'),
  ('cg-aseo-limpieza', 'Aseo y Limpieza', 'Otros Costos Directos'),
  ('cg-electricidad', 'Gastos de Electricidad', 'Otros Costos Directos'),
  ('cg-agua-potable', 'Gastos de Agua Potable', 'Otros Costos Directos'),
  ('cg-ropa-utiles', 'Ropa y Útiles de Trabajo', 'Otros Costos Directos'),
  ('cg-combustibles', 'Gastos de Combustibles', 'Otros Costos Directos'),
  ('cg-otros-gastos-directos', 'Otros Gastos Directos', 'Otros Costos Directos'),
  ('cg-sueldo-base', 'Sueldo Base', 'Gasto de Remuneraciones'),
  ('cg-gratificacion', 'Gratificación', 'Gasto de Remuneraciones'),
  ('cg-aguinaldos', 'Aguinaldos', 'Gasto de Remuneraciones'),
  ('cg-aporte-patronal', 'Aporte Patronal', 'Gasto de Remuneraciones'),
  ('cg-servicios-terceros', 'Servicios de Terceros', 'Gasto de Remuneraciones'),
  ('cg-vacaciones', 'Vacaciones', 'Gasto de Remuneraciones'),
  ('cg-honorarios-profesionales', 'Honorarios Profesionales', 'Gastos de Administración'),
  ('cg-gastos-notariales', 'Gastos Notariales', 'Gastos de Administración'),
  ('cg-articulos-oficina', 'Gastos y Artículos de Oficina', 'Gastos de Administración'),
  ('cg-publicidad-papeleria', 'Gastos de Publicidad - Papelería', 'Gastos de Administración'),
  ('cg-internet-transmision', 'Gastos de Internet y Transmisión de Datos', 'Gastos de Administración'),
  ('cg-fletes-embalajes', 'Fletes y Embalajes', 'Gastos de Administración'),
  ('cg-seguros', 'Seguros', 'Gastos de Administración'),
  ('cg-arriendos', 'Arriendos', 'Gastos de Administración'),
  ('cg-pasajes-peajes', 'Gastos de Pasajes - Peajes', 'Gastos de Administración'),
  ('cg-cafeteria', 'Gastos de Cafetería y Similares', 'Gastos de Administración'),
  ('cg-seguridad', 'Gastos en Seguridad', 'Gastos de Administración'),
  ('cg-gastos-bancarios', 'Gastos Bancarios', 'Gastos Financieros Bancarios'),
  ('cg-costo-venta-activos-fijos', 'Costo de Venta por Enajenación de Activos Fijos', 'Otros Egresos Fuera de la Explotación')
on conflict (id) do nothing;

-- Tabla "singleton" (una sola fila) para configuración global.
create table if not exists config (
  id boolean primary key default true check (id),
  pin_admin text not null default '1234'
);
insert into config (id, pin_admin) values (true, '1234') on conflict (id) do nothing;

-- RLS: esta app no usa Supabase Auth, así que por defecto habilitamos
-- acceso completo al rol anónimo — el mismo modelo "abierto" que ya tenía
-- el proyecto en Firestore. La excepción es "administradores": esa tabla
-- guarda las contraseñas de Evelyn/Juan (que además dan acceso a todo lo
-- demás), así que al anon NO se le da ninguna política sobre la tabla base
-- (con RLS habilitada y sin políticas, el acceso queda denegado por
-- defecto) — solo puede leer administradores_publicos (sin la columna
-- clave). Las escrituras y la verificación de contraseña pasan por rutas
-- server-side (/api/admin/*) que usan la service role key, la cual sí
-- puede saltarse RLS.
alter table clientes enable row level security;
alter table ingresos enable row level security;
alter table ventas enable row level security;
alter table operadores enable row level security;
alter table administradores enable row level security;
alter table precios enable row level security;
alter table config enable row level security;
alter table cupones enable row level security;
alter table movimientos_contables enable row level security;
alter table categorias_gasto enable row level security;

-- Cada política se recrea (drop + create) para que este archivo se pueda
-- correr completo las veces que sea necesario sin errores de "ya existe".
drop policy if exists "anon full access" on clientes;
create policy "anon full access" on clientes for all to anon using (true) with check (true);
drop policy if exists "anon full access" on ingresos;
create policy "anon full access" on ingresos for all to anon using (true) with check (true);
drop policy if exists "anon full access" on ventas;
create policy "anon full access" on ventas for all to anon using (true) with check (true);
drop policy if exists "anon full access" on operadores;
create policy "anon full access" on operadores for all to anon using (true) with check (true);
-- administradores: sin política para anon a propósito (ver comentario
-- arriba). Si esta migración corre sobre una base que ya tenía la política
-- abierta anterior, esto la elimina.
drop policy if exists "anon full access" on administradores;
grant select on administradores_publicos to anon;
drop policy if exists "anon full access" on precios;
create policy "anon full access" on precios for all to anon using (true) with check (true);
drop policy if exists "anon full access" on config;
create policy "anon full access" on config for all to anon using (true) with check (true);
drop policy if exists "anon full access" on cupones;
create policy "anon full access" on cupones for all to anon using (true) with check (true);
drop policy if exists "anon full access" on movimientos_contables;
create policy "anon full access" on movimientos_contables for all to anon using (true) with check (true);
drop policy if exists "anon full access" on categorias_gasto;
create policy "anon full access" on categorias_gasto for all to anon using (true) with check (true);

-- Bucket de Storage para adjuntar el comprobante (boleta/factura escaneada)
-- de un egreso/gasto.
insert into storage.buckets (id, name, public)
values ('comprobantes-gastos', 'comprobantes-gastos', true)
on conflict (id) do nothing;

drop policy if exists "anon full access comprobantes-gastos" on storage.objects;
create policy "anon full access comprobantes-gastos" on storage.objects
  for all to anon
  using (bucket_id = 'comprobantes-gastos')
  with check (bucket_id = 'comprobantes-gastos');
