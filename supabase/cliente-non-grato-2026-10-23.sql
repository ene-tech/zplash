-- Cliente non grato: marcado desde la ficha del cliente, el mesón no le da
-- ingreso ni le cobra, y por la web no puede pagar ni se le cobra la tarjeta
-- inscrita (ver nonGrato en src/db/schema/clientes.ts).
--
-- Default false: todos los clientes siguen exactamente como estaban.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "non_grato" boolean NOT NULL DEFAULT false;
