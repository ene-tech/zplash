-- Compras sueltas cobradas con un toque contra la tarjeta Oneclick ya inscrita,
-- desde el link personal de un SMS (/v/[codigo]). Aparte de cobros_oneclick,
-- que es solo la mensualidad del plan (ver comprasOneclick en @/db/schema/pagos).
CREATE TABLE IF NOT EXISTS "compras_oneclick" (
	"id" text PRIMARY KEY NOT NULL,
	"patente" text NOT NULL,
	"suscripcion_id" text REFERENCES "suscripciones_oneclick"("id") ON DELETE SET NULL,
	"codigo_link" text,
	"concepto" text NOT NULL,
	"monto" numeric NOT NULL,
	"cupon_codigo" text,
	"estado" text NOT NULL,
	"response_code" integer,
	"authorization_code" text,
	"venta_id" text REFERENCES "ventas"("id") ON DELETE SET NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compras_oneclick_patente_idx" ON "compras_oneclick" USING btree ("patente");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compras_oneclick_codigo_link_idx" ON "compras_oneclick" USING btree ("codigo_link");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compras_oneclick_venta_idx" ON "compras_oneclick" USING btree ("venta_id");--> statement-breakpoint
-- Sin políticas, como el resto: se lee y escribe solo por DATABASE_URL.
ALTER TABLE "compras_oneclick" ENABLE ROW LEVEL SECURITY;
