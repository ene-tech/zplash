-- Comuna y ciudad de la empresa para el receptor de la factura (CmnaRecep y
-- CiudadRecep en SimpleFactura). Antes la comuna se sacaba de lo que iba
-- después de la última coma de la dirección y la ciudad era siempre Temuco.
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "comuna" text;
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "ciudad" text;
-- Las empresas ya registradas toman la comuna de su dirección (mismo criterio
-- que usaba la factura); la ciudad queda vacía y la factura sigue usando Temuco.
UPDATE "empresas" SET "comuna" = btrim(regexp_replace("direccion", '^.*,', ''))
  WHERE "comuna" IS NULL AND "direccion" LIKE '%,%' AND btrim(regexp_replace("direccion", '^.*,', '')) <> '';
