ALTER TABLE "otps_cliente" ADD COLUMN "email" text;--> statement-breakpoint
CREATE INDEX "otps_cliente_email_idx" ON "otps_cliente" USING btree ("email");