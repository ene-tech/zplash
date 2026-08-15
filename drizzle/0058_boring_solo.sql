ALTER TABLE "config" ALTER COLUMN "vigencia_dias_pack_empresa" SET DEFAULT 45;--> statement-breakpoint
-- Se elimina la zona Venta Empresa (packs 10/20/30/40 con vigencia de 365
-- días) en favor del nuevo Pack de Tickets en Tipo de Lavados, con vigencia
-- de 45 días — se actualiza la fila singleton existente para que el cambio
-- aplique sin depender de que un admin reguarde Web Settings.
UPDATE "config" SET "vigencia_dias_pack_empresa" = 45;