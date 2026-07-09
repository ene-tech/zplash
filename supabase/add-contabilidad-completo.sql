-- Corre esto una sola vez en el SQL Editor. Reemplaza a add-contabilidad.sql,
-- add-datos-proveedor.sql, add-tipo-documento.sql y add-documento-adjunto.sql
-- (ninguno de esos había corrido realmente, porque la tabla base nunca se
-- creó) — este script deja la tabla completa desde cero, con todas las
-- columnas que el módulo de Contabilidad necesita hoy.

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

-- Por si la tabla ya existía parcialmente (de un intento anterior), agrega
-- cualquier columna que falte sin tocar las que ya están.
alter table movimientos_contables add column if not exists rut_proveedor text;
alter table movimientos_contables add column if not exists numero_factura text;
alter table movimientos_contables add column if not exists tipo_documento text;
alter table movimientos_contables add column if not exists documento_url text;
alter table movimientos_contables add column if not exists documento_nombre text;

create index if not exists movimientos_contables_fecha_idx on movimientos_contables (fecha desc);
create index if not exists movimientos_contables_tipo_idx on movimientos_contables (tipo);

alter table movimientos_contables enable row level security;

drop policy if exists "anon full access" on movimientos_contables;
create policy "anon full access" on movimientos_contables for all to anon using (true) with check (true);

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
