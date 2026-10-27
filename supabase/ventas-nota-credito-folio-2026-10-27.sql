-- Guarda el folio SII de la nota de crédito que anuló la factura de cada venta
-- (pestaña Facturas → "Nota de crédito"). 0 = emitiéndose o sin confirmar.
alter table ventas add column if not exists nota_credito_folio integer;
