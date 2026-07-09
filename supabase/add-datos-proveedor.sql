-- Datos de proveedor para los egresos/gastos: RUT y N° de factura.
alter table movimientos_contables add column if not exists rut_proveedor text;
alter table movimientos_contables add column if not exists numero_factura text;
