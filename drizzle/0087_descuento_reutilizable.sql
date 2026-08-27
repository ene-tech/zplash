-- Descuentos con restricciones: "solo clientes nuevos" y "un uso por patente"
-- (ver Crear descuento en B2B/Tickets/Dsctos).
--
-- un_uso_por_patente = true hace que el código NO muera en el primer canje:
-- queda vigente hasta caducar y cada patente puede usarlo una sola vez, con
-- las que ya lo usaron en patentes_usadas (reemplaza a usado/patente_uso en
-- ese modo). Default false en ambos para no tocar los cupones ya emitidos.
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "un_uso_por_patente" boolean NOT NULL DEFAULT false;
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "patentes_usadas" jsonb;
ALTER TABLE "cupones" ADD COLUMN IF NOT EXISTS "solo_clientes_nuevos" boolean NOT NULL DEFAULT false;
