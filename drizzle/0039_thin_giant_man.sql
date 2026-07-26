ALTER TABLE "config" ADD COLUMN "imagen_precios_whatsapp" text;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "imagen_plan_whatsapp" text;--> statement-breakpoint
ALTER TABLE "plantillas_whatsapp" ADD COLUMN "meta_aprobado" boolean DEFAULT false NOT NULL;