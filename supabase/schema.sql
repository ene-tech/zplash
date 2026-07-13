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

-- Empresas de compra y venta para emitir/recibir facturas. contacto_cliente_id
-- referencia a clientes.id (ver FK más abajo, ON DELETE SET NULL): si el
-- cliente contacto se elimina, la empresa queda desvinculada pero no se
-- borra; contacto_nombre queda denormalizado igual para no perder el dato.
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

-- cliente_id referencia a clientes.id (ver FK más abajo, ON DELETE SET
-- NULL): en Firestore nunca hubo integridad referencial, así que hay
-- ingresos/ventas históricos que apuntan a un cliente ya eliminado — la FK
-- con SET NULL preserva ese historial en vez de bloquearlo o borrarlo.
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
  cupon_codigo text,
  glosa text
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

-- Un perfil por persona (reemplaza a las antiguas `operadores` y
-- `administradores`, ver supabase/migrar-perfiles.sql). `modulos` es la
-- lista de vistas principales a las que el perfil tiene acceso una vez
-- que inicia sesión; solo quien tiene el módulo "permisos" (Gerencia por
-- defecto) puede editar la de otros. El login y cualquier operación que
-- toque `clave` corren server-side (rutas /api/perfiles/*) — el cliente
-- (anon) nunca debe poder leer esa columna.
-- rut/cargo/fecha_ingreso/sueldo_base son la ficha de Remuneraciones (ver
-- ColaboradorFicha en src/types.ts): viven en la misma fila que el login
-- por decisión explícita (evita una tabla 1:1 aparte), pero la query
-- liviana que alimenta la pantalla de login (antes de iniciar sesión)
-- sigue sin pedir estas columnas, igual que ya hacía con `clave`.
create table if not exists perfiles (
  id text primary key,
  nombre text not null unique,
  clave text not null,
  modulos jsonb not null default '[]'::jsonb,
  icono text,
  rut text,
  cargo text,
  fecha_ingreso timestamptz,
  sueldo_base numeric,
  creado_en timestamptz not null default now()
);
alter table perfiles add column if not exists rut text;
alter table perfiles add column if not exists cargo text;
alter table perfiles add column if not exists fecha_ingreso timestamptz;
alter table perfiles add column if not exists sueldo_base numeric;

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
  creado_por text,
  tipo text not null default 'vale',
  patente_asignada text,
  es_porcentaje boolean not null default false
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
  -- Ciclo de vida contable, no confundir con ventas.estado_pago (POS): son
  -- vocabularios distintos a propósito, evaluado y descartado unificarlos
  -- porque los valores no tienen equivalente cruzado (abono50 vs
  -- x_rendir/pagado_cc). Ver MovimientoContable/Venta en src/types.ts.
  estado text not null default 'pendiente',
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);
create index if not exists movimientos_contables_fecha_idx on movimientos_contables (fecha desc);
create index if not exists movimientos_contables_tipo_idx on movimientos_contables (tipo);

-- Liquidaciones de sueldo, una fila por período pagado a un colaborador (ver
-- RemuneracionesTab / ColaboradorFicha). perfil_id sí lleva FK con ON DELETE
-- CASCADE (a diferencia de creado_por→perfiles.nombre, que queda sin FK):
-- una liquidación no tiene sentido huérfana de su colaborador.
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

-- Foreign keys: solo en las relaciones donde se verificó que no hay filas
-- huérfanas irreconciliables (ver evaluación en supabase/add-foreign-keys.sql
-- para bases ya existentes). ON DELETE SET NULL preserva el historial si se
-- borra el cliente/cupón referenciado, en vez de bloquear el borrado o
-- arrastrar el borrado en cascada. Quedan pendientes (no se fuerzan) las
-- relaciones de creado_por→perfiles.nombre, categoria→categorias_gasto.nombre
-- y plan→precios.plan: tienen valores sintéticos o históricos que no calzan
-- con una FK (ver MovimientoContable/Venta en src/types.ts).
alter table ingresos add constraint ingresos_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;
alter table ventas add constraint ventas_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;
alter table empresas add constraint empresas_contacto_cliente_id_fkey
  foreign key (contacto_cliente_id) references clientes(id) on delete set null;
alter table ingresos add constraint ingresos_cupon_codigo_fkey
  foreign key (cupon_codigo) references cupones(codigo) on delete set null;

-- Log de auditoría: quién modificó qué fila y cuándo, para las tablas que
-- mueven dinero o datos de clientes. Se escribe a nivel de aplicación (ver
-- commit() en AppContext.tsx), no con triggers: esta app no usa Supabase
-- Auth/RLS, toda la escritura pasa por una sola conexión server-side
-- (DATABASE_URL) que no sabe qué perfil está logueado a nivel de DB. Por eso
-- NO captura ediciones manuales hechas directo en el SQL Editor de Supabase.
create table if not exists auditoria (
  id bigserial primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('insert', 'update', 'delete')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists auditoria_tabla_registro_idx on auditoria (tabla, registro_id);
create index if not exists auditoria_creado_en_idx on auditoria (creado_en desc);

-- RLS: esta app no usa Supabase Auth. Todo el acceso a estas tablas —
-- lectura y escritura — pasa por Server Actions (`src/lib/db.ts`, "use
-- server") a través de la conexión directa a Postgres (DATABASE_URL), que
-- se salta RLS. El navegador nunca consulta estas tablas vía PostgREST con
-- la anon key, así que no se le da NINGUNA política al rol anon: con RLS
-- habilitada y sin políticas, el acceso queda denegado por defecto. Esto
-- incluye a "perfiles" (guarda la clave de cada persona) por el mismo
-- motivo. La única excepción real es Storage (bucket comprobantes-gastos,
-- ver más abajo), que sí se usa con la anon key.
alter table empresas enable row level security;
alter table clientes enable row level security;
alter table ingresos enable row level security;
alter table ventas enable row level security;
alter table perfiles enable row level security;
alter table precios enable row level security;
alter table config enable row level security;
alter table cupones enable row level security;
alter table movimientos_contables enable row level security;
alter table categorias_gasto enable row level security;
alter table auditoria enable row level security;
alter table liquidaciones_sueldo enable row level security;

-- Sin políticas para anon en ninguna de estas tablas (ver comentario
-- arriba). Se dropean explícitamente por si el proyecto ya tenía las
-- políticas "anon full access" de una versión anterior de este archivo.
drop policy if exists "anon full access" on auditoria;
drop policy if exists "anon full access" on empresas;
drop policy if exists "anon full access" on clientes;
drop policy if exists "anon full access" on ingresos;
drop policy if exists "anon full access" on ventas;
drop policy if exists "anon full access" on perfiles;
drop policy if exists "anon full access" on precios;
drop policy if exists "anon full access" on config;
drop policy if exists "anon full access" on cupones;
drop policy if exists "anon full access" on movimientos_contables;
drop policy if exists "anon full access" on categorias_gasto;
drop policy if exists "anon full access" on liquidaciones_sueldo;

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

-- Bucket de Storage para adjuntar el documento de una liquidación de sueldo.
-- Público igual que comprobantes-gastos (ver comentario ahí): esta app no
-- tiene sesión por colaborador todavía, así que no hay forma de restringir
-- la URL a "solo su ficha" a nivel de Storage sin Supabase Auth — queda
-- pendiente para cuando exista login por colaborador (ver RemuneracionesTab).
insert into storage.buckets (id, name, public)
values ('liquidaciones-sueldo', 'liquidaciones-sueldo', true)
on conflict (id) do nothing;

drop policy if exists "anon full access liquidaciones-sueldo" on storage.objects;
create policy "anon full access liquidaciones-sueldo" on storage.objects
  for all to anon
  using (bucket_id = 'liquidaciones-sueldo')
  with check (bucket_id = 'liquidaciones-sueldo');
