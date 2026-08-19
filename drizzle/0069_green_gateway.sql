CREATE TABLE "planes_mantencion" (
	"id" text PRIMARY KEY NOT NULL,
	"maquinaria_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"repuestos" text,
	"periodicidad_tipo" text NOT NULL,
	"intervalo_dias" integer,
	"intervalo_lavados" integer,
	"aviso_dias" integer,
	"aviso_lavados" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
ALTER TABLE "maquinarias" ADD COLUMN "zona" text;--> statement-breakpoint
ALTER TABLE "registros_mantencion" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "planes_mantencion" ADD CONSTRAINT "planes_mantencion_maquinaria_id_maquinarias_id_fk" FOREIGN KEY ("maquinaria_id") REFERENCES "public"."maquinarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planes_mantencion_maquinaria_idx" ON "planes_mantencion" USING btree ("maquinaria_id");--> statement-breakpoint
ALTER TABLE "registros_mantencion" ADD CONSTRAINT "registros_mantencion_plan_id_planes_mantencion_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_mantencion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Sin políticas, igual que el resto de las tablas: toda la escritura/lectura
-- pasa por Server Actions con DATABASE_URL (que se salta RLS) y la anon key
-- del bundle no debe poder tocar nada. Ver supabase/rls-tablas-faltantes-2026-08-11.sql.
ALTER TABLE "planes_mantencion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Backfill: la periodicidad única que vivía en maquinarias.periodicidad_tipo
-- pasa a ser una tarea del plan, y los registros existentes de esa máquina
-- quedan colgados de ella para que el contador arranque donde estaba (mismo
-- resultado que calculaba mantencionStatus antes de este cambio). Las
-- columnas viejas de maquinarias quedan en la tabla pero ya no se leen.
INSERT INTO "planes_mantencion" ("id", "maquinaria_id", "descripcion", "periodicidad_tipo", "intervalo_dias", "intervalo_lavados", "activo", "creado_en", "creado_por")
SELECT 'plan-' || "id", "id", 'Mantención general', "periodicidad_tipo", "intervalo_dias", "intervalo_lavados", true, "creado_en", "creado_por"
FROM "maquinarias"
WHERE "periodicidad_tipo" IS NOT NULL;--> statement-breakpoint
UPDATE "registros_mantencion" r
SET "plan_id" = 'plan-' || r."maquinaria_id"
WHERE EXISTS (SELECT 1 FROM "planes_mantencion" p WHERE p."id" = 'plan-' || r."maquinaria_id");
