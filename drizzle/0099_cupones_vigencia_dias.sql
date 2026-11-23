-- Tickets y descuentos con "válido desde" y días de la semana permitidos.
-- Null en las dos = sin restricción (todos los cupones ya emitidos).
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "valido_desde" timestamp with time zone;
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "dias_semana" jsonb;
