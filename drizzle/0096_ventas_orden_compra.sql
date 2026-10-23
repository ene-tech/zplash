-- N° de orden de compra de una venta de Venta Empresa pagada con "Orden de
-- compra" (ver ordenCompra en src/db/schema/ventas.ts): la factura lo escribe
-- a continuación del producto. Las ventas existentes quedan en null.
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "orden_compra" text;
