-- Canal de un descuento: dónde se puede cobrar el código — "web" (Webpay,
-- Oneclick, Mi Cuenta), "local" (mesón) o "ambos" (ver Crear descuento en
-- B2B/Tickets/Dsctos y cuponValeEnCanal en @/lib/helpers/cupones).
--
-- Default "ambos" para no cambiar nada de lo ya emitido: los cupones que hoy
-- valen en los dos lados siguen valiendo. Un "vale" ignora el campo, siempre
-- se canjea en el mesón.
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "canal" text NOT NULL DEFAULT 'ambos';
