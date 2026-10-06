-- Módulo Fabricación (maquila de químicos). Ver src/db/schema/inventario/fabricacion.ts.
--
-- Qué hace: crea las tablas de materias primas, fórmulas (en % por litro),
-- recepciones desde la fábrica y el historial de movimientos de materias
-- primas. Además pasa `insumos.stock` de entero a decimal, para poder
-- guardar litros sueltos (37,5 L). Los valores que ya hay quedan iguales.
--
-- Qué NO toca: ningún dato existente. No crea egresos ni mueve stock: eso
-- lo hace la app cuando se registra una recepción.
--
-- Idempotente: se puede volver a correr sin romper nada.

alter table insumos alter column stock type numeric using stock::numeric;

create table if not exists materias_primas (
  id text primary key,
  nombre text not null,
  unidad text not null default 'kg',
  -- true: la compramos nosotros y queda guardada en la fábrica (se descuenta).
  -- false: la pone la fábrica y nos la cobra a costo_unitario.
  propia boolean not null default true,
  costo_unitario numeric not null default 0,
  stock numeric not null default 0,
  stock_min numeric not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists formulas (
  id text primary key,
  insumo_id text not null unique references insumos(id) on delete cascade,
  maquila_por_litro numeric not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists formula_componentes (
  id text primary key,
  formula_id text not null references formulas(id) on delete cascade,
  -- restrict: no se puede borrar una materia prima que alguna fórmula usa.
  materia_prima_id text not null references materias_primas(id) on delete restrict,
  porcentaje numeric not null
);
create index if not exists formula_componentes_formula_idx on formula_componentes (formula_id);

create table if not exists recepciones_fabrica (
  id text primary key,
  fecha timestamptz not null default now(),
  proveedor_id text references proveedores(id) on delete set null,
  numero_documento text,
  total_maquila numeric not null default 0,
  total_materias_fabrica numeric not null default 0,
  movimiento_contable_id text,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por text
);

create table if not exists recepcion_fabrica_lineas (
  id text primary key,
  recepcion_id text not null references recepciones_fabrica(id) on delete cascade,
  insumo_id text references insumos(id) on delete set null,
  insumo_nombre text not null,
  litros numeric not null,
  maquila numeric not null default 0,
  materias_fabrica numeric not null default 0
);
create index if not exists recepcion_fabrica_lineas_recepcion_idx on recepcion_fabrica_lineas (recepcion_id);

create table if not exists movimientos_materia_prima (
  id text primary key,
  materia_prima_id text not null references materias_primas(id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null,
  cantidad numeric not null,
  recepcion_id text references recepciones_fabrica(id) on delete set null,
  notas text,
  creado_por text
);
create index if not exists movimientos_materia_prima_mp_idx on movimientos_materia_prima (materia_prima_id, fecha);

-- Misma política que el resto: la app escribe por Server Actions con
-- DATABASE_URL (se salta RLS). Sin policies para anon = denegado desde el
-- navegador.
alter table materias_primas enable row level security;
alter table formulas enable row level security;
alter table formula_componentes enable row level security;
alter table recepciones_fabrica enable row level security;
alter table recepcion_fabrica_lineas enable row level security;
alter table movimientos_materia_prima enable row level security;
