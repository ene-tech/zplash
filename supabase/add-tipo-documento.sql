-- Tipo de documento (Boleta o Factura) para los egresos/gastos.
alter table movimientos_contables add column if not exists tipo_documento text;
