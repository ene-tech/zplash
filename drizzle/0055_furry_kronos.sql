CREATE TABLE "precios_tamano" (
	"servicio_id" text PRIMARY KEY NOT NULL,
	"s" numeric DEFAULT 0 NOT NULL,
	"m" numeric DEFAULT 0 NOT NULL,
	"l" numeric DEFAULT 0 NOT NULL,
	"xl" numeric DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "precios_tamano" ADD CONSTRAINT "precios_tamano_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;