-- Corre esto una sola vez en el SQL Editor: agrega la tabla "empresas"
-- (registro de empresas de compra y venta para emitir/recibir facturas,
-- pestaña Administración > Empresas).
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
