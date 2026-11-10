-- Facturas de compra recibidas en facturascompra@zplash.cl (correo de
-- intercambio del SII). Ver src/db/schema/documentosCompra.ts.
--
-- Qué hace: crea la tabla donde la app guarda cada documento tributario que
-- un proveedor le manda a Zplash (factura, nota de crédito, guía…) con sus
-- montos, el detalle y el XML, y cómo se clasificó (gasto con su egreso, o
-- compra de activo).
--
-- Qué NO toca: ninguna tabla existente ni ningún dato.
-- Va ANTES del deploy. Idempotente: se puede volver a correr.

create table if not exists documentos_compra (
  id text primary key,
  tipo_dte numeric not null,
  folio numeric not null,
  fecha_emision text not null,
  fecha_vencimiento text,
  rut_emisor text not null,
  razon_social_emisor text not null,
  giro_emisor text,
  monto_neto numeric not null default 0,
  monto_exento numeric not null default 0,
  iva numeric not null default 0,
  monto_total numeric not null default 0,
  detalle jsonb not null default '[]'::jsonb,
  xml text not null,
  correo_de text,
  correo_asunto text,
  recibido_en timestamptz not null default now(),
  estado text not null default 'pendiente',
  clasificacion text,
  categoria text,
  movimiento_contable_id text references movimientos_contables(id) on delete set null,
  clasificado_en timestamptz,
  clasificado_por text
);

create index if not exists documentos_compra_fecha_idx on documentos_compra (fecha_emision);
create index if not exists documentos_compra_rut_idx on documentos_compra (rut_emisor);

-- Solo el servidor (conexión directa) lee y escribe: sin políticas para anon.
alter table documentos_compra enable row level security;
