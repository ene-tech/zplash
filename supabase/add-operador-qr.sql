-- Atribución de ventas por QR del mesón: qué operador mostró el QR con que el
-- cliente pagó el plan con tarjeta. Se pega a mano en Supabase (SQL Editor)
-- ANTES de desplegar el código que las usa: drizzle hace select de todas las
-- columnas del schema y sin estas las consultas a ventas/suscripciones fallan.
-- Solo agrega columnas vacías (null); no modifica ninguna fila existente.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS operador_qr text;
ALTER TABLE suscripciones_oneclick ADD COLUMN IF NOT EXISTS operador_qr text;
