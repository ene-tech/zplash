DROP INDEX "otps_cliente_telefono_idx";--> statement-breakpoint
ALTER TABLE "otps_cliente" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "otps_cliente" DROP COLUMN "telefono";