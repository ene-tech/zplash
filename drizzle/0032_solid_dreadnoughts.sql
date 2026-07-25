CREATE TABLE "alertas_mantencion" (
	"id" text PRIMARY KEY NOT NULL,
	"maquinaria_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"fecha_objetivo" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	"completado_en" timestamp with time zone,
	"registro_mantencion_id" text
);
--> statement-breakpoint
ALTER TABLE "alertas_mantencion" ADD CONSTRAINT "alertas_mantencion_maquinaria_id_maquinarias_id_fk" FOREIGN KEY ("maquinaria_id") REFERENCES "public"."maquinarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_mantencion" ADD CONSTRAINT "alertas_mantencion_registro_mantencion_id_registros_mantencion_id_fk" FOREIGN KEY ("registro_mantencion_id") REFERENCES "public"."registros_mantencion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_mantencion_fecha_objetivo_idx" ON "alertas_mantencion" USING btree ("fecha_objetivo");