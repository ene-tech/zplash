CREATE TABLE "contratos_funcionario" (
	"id" text PRIMARY KEY NOT NULL,
	"cargo" text NOT NULL,
	"tipo_contrato" text NOT NULL,
	"jornada_horas_semana" integer,
	"fecha_inicio" text NOT NULL,
	"fecha_termino" text,
	"documento_url" text,
	"notas" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcas_asistencia" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"perfil_nombre" text NOT NULL,
	"fecha" text NOT NULL,
	"tipo" text NOT NULL,
	"marcado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric,
	"lng" numeric,
	"precision_m" integer,
	"distancia_m" integer,
	"en_el_local" boolean,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "tareas_turno" (
	"id" text PRIMARY KEY NOT NULL,
	"turno" text NOT NULL,
	"descripcion" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas_turno_hechas" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"turno" text NOT NULL,
	"tarea_id" text NOT NULL,
	"perfil_id" text NOT NULL,
	"perfil_nombre" text NOT NULL,
	"completado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "turnos_funcionario" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"dia_semana" integer NOT NULL,
	"turno" text DEFAULT 'normal' NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "local_lat" numeric;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "local_lng" numeric;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "radio_asistencia_metros" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "contratos_funcionario" ADD CONSTRAINT "contratos_funcionario_id_perfiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_funcionario" ADD CONSTRAINT "turnos_funcionario_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marcas_asistencia_fecha_idx" ON "marcas_asistencia" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "marcas_asistencia_perfil_idx" ON "marcas_asistencia" USING btree ("perfil_id");--> statement-breakpoint
CREATE INDEX "tareas_turno_turno_idx" ON "tareas_turno" USING btree ("turno");--> statement-breakpoint
CREATE INDEX "tareas_turno_hechas_fecha_idx" ON "tareas_turno_hechas" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_funcionario_perfil_dia_idx" ON "turnos_funcionario" USING btree ("perfil_id","dia_semana");--> statement-breakpoint
-- Sin políticas, igual que el resto de las tablas: toda la escritura/lectura
-- pasa por Server Actions con DATABASE_URL (que se salta RLS) y la anon key
-- del bundle no debe poder tocar nada. Sin esto, la API REST auto-generada de
-- Supabase serviría el libro de asistencia (con geolocalización) y los
-- contratos a cualquiera con esa key pública. Ver
-- supabase/rls-tablas-faltantes-2026-08-11.sql.
ALTER TABLE "turnos_funcionario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tareas_turno" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tareas_turno_hechas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marcas_asistencia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contratos_funcionario" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Semilla del checklist real de apertura y cierre del local. Va como INSERT y
-- no como constante TAREAS_TURNO_DEFAULT con fallback "si la tabla está
-- vacía": con ese patrón, desactivar UNA tarea guarda solo esa fila (el commit
-- de la app manda al servidor únicamente lo que cambió, ver diffPorId) y las
-- otras siete se perderían al recargar, porque la tabla ya no estaría vacía.
-- `orden` es la secuencia en que se ejecutan, no alfabético. Gerencia las
-- edita después desde Mi Entorno → Apertura y Cierre.
INSERT INTO "tareas_turno" ("id", "turno", "descripcion", "orden", "activo") VALUES
  ('tt-ap-1', 'apertura', 'Abrir la llave general de agua', 1, true),
  ('tt-ap-2', 'apertura', 'Purgar el agua de los compresores', 2, true),
  ('tt-ap-3', 'apertura', 'Cambiar el selector de luz eléctrica a operación', 3, true),
  ('tt-ap-4', 'apertura', 'Revisar nivel de químicos y shampoo', 4, true),
  ('tt-ci-1', 'cierre', 'Cambiar el selector de luz eléctrica', 1, true),
  ('tt-ci-2', 'cierre', 'Cortar la matriz general de agua', 2, true),
  ('tt-ci-3', 'cierre', 'Apagar compresores y purgar estanque', 3, true),
  ('tt-ci-4', 'cierre', 'Cerrar cortinas y activar la alarma', 4, true)
ON CONFLICT ("id") DO NOTHING;
