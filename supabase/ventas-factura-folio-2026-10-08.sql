-- Guarda el folio SII de cada factura emitida por SimpleFactura (ficha de empresa).
alter table ventas add column if not exists factura_folio integer;
