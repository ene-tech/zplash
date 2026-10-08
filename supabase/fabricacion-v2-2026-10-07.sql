-- Módulo Fabricación v2: presentaciones (20 L, 1 L, 500 ml…), materias primas
-- mixtas (lo nuestro primero, lo que falta lo pone la fábrica) y costo FIFO.
-- Ver src/db/schema/inventario/fabricacion.ts.
--
-- Qué hace: BORRA y vuelve a crear las tablas del módulo Fabricación
-- (verificado el 7-oct-2026: las 6 estaban vacías, nadie lo había usado).
-- Qué NO toca: productos, insumos, proveedores, contabilidad ni ningún otro dato.
-- Se puede pegar dos veces: la segunda vez vuelve a dejar las tablas vacías,
-- así que NO pegarlo de nuevo cuando ya se hayan cargado datos.

drop table if exists recepcion_fabrica_lineas, movimientos_materia_prima, recepciones_fabrica,
  presentacion_componentes, presentaciones, formula_componentes, formulas,
  lotes_materia_prima, materias_primas cascade;

create table materias_primas (
  id text primary key,
  nombre text not null,
  unidad text not null default 'L',
  -- null = la fábrica no la pone (fragancia, envases). Neto por unidad.
  precio_fabrica numeric,
  stock numeric not null default 0,
  stock_min numeric not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create table lotes_materia_prima (
  id text primary key,
  materia_prima_id text not null references materias_primas(id) on delete cascade,
  fecha timestamptz not null default now(),
  cantidad numeric not null,
  restante numeric not null,
  costo_unitario numeric not null default 0,
  notas text,
  creado_por text
);
create index lotes_materia_prima_mp_idx on lotes_materia_prima (materia_prima_id, fecha);

create table formulas (
  id text primary key,
  nombre text not null,
  notas text,
  creado_en timestamptz not null default now()
);

create table formula_componentes (
  id text primary key,
  formula_id text not null references formulas(id) on delete cascade,
  materia_prima_id text not null references materias_primas(id) on delete restrict,
  porcentaje numeric not null
);
create index formula_componentes_formula_idx on formula_componentes (formula_id);

create table presentaciones (
  id text primary key,
  formula_id text not null references formulas(id) on delete cascade,
  producto_id text unique references productos(id) on delete cascade,
  insumo_id text unique references insumos(id) on delete cascade,
  ml_por_unidad numeric not null,
  maquila_por_unidad numeric not null default 0,
  activa boolean not null default true,
  -- Suma stock a un Producto del POS o a un Insumo, nunca a los dos.
  constraint presentaciones_un_destino check (num_nonnulls(producto_id, insumo_id) = 1)
);
create index presentaciones_formula_idx on presentaciones (formula_id);

create table presentacion_componentes (
  id text primary key,
  presentacion_id text not null references presentaciones(id) on delete cascade,
  materia_prima_id text not null references materias_primas(id) on delete restrict,
  cantidad_por_unidad numeric not null
);
create index presentacion_componentes_presentacion_idx on presentacion_componentes (presentacion_id);

create table recepciones_fabrica (
  id text primary key,
  fecha timestamptz not null default now(),
  proveedor_id text references proveedores(id) on delete set null,
  numero_documento text,
  total_maquila numeric not null default 0,
  total_materias_fabrica numeric not null default 0,
  total_propias numeric not null default 0,
  movimiento_contable_id text,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);

create table recepcion_fabrica_lineas (
  id text primary key,
  recepcion_id text not null references recepciones_fabrica(id) on delete cascade,
  presentacion_id text references presentaciones(id) on delete set null,
  producto_id text references productos(id) on delete set null,
  insumo_id text references insumos(id) on delete set null,
  nombre text not null,
  unidades numeric not null,
  maquila numeric not null default 0,
  materias_fabrica numeric not null default 0,
  propias numeric not null default 0
);
create index recepcion_fabrica_lineas_recepcion_idx on recepcion_fabrica_lineas (recepcion_id);

create table movimientos_materia_prima (
  id text primary key,
  materia_prima_id text not null references materias_primas(id) on delete cascade,
  lote_id text references lotes_materia_prima(id) on delete set null,
  fecha timestamptz not null default now(),
  tipo text not null,
  cantidad numeric not null,
  costo_unitario numeric not null default 0,
  recepcion_id text references recepciones_fabrica(id) on delete set null,
  notas text,
  creado_por text
);
create index movimientos_materia_prima_mp_idx on movimientos_materia_prima (materia_prima_id, fecha);

-- Misma política que el resto: la app escribe por Server Actions con
-- DATABASE_URL (se salta RLS). Sin policies para anon = denegado desde el navegador.
alter table materias_primas enable row level security;
alter table lotes_materia_prima enable row level security;
alter table formulas enable row level security;
alter table formula_componentes enable row level security;
alter table presentaciones enable row level security;
alter table presentacion_componentes enable row level security;
alter table recepciones_fabrica enable row level security;
alter table recepcion_fabrica_lineas enable row level security;
alter table movimientos_materia_prima enable row level security;
