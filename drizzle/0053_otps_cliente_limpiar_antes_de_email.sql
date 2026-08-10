-- otps_cliente pasa de identificarse por telefono a email (ver
-- src/db/schema/otpCliente.ts). Las filas son códigos de un solo uso que
-- expiran en 5 minutos: no hay dato real que backfillear desde telefono, así
-- que se vacía la tabla en vez de migrar datos. Peor caso: alguien con un
-- código pendiente en este instante debe pedirlo de nuevo.
TRUNCATE TABLE "otps_cliente";
