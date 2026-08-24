ALTER TABLE "tareas_turno" ADD COLUMN "zona" text DEFAULT 'prelavado' NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas_turno_hechas" ADD COLUMN "zona" text DEFAULT 'prelavado' NOT NULL;--> statement-breakpoint
ALTER TABLE "turnos_funcionario" DROP COLUMN "puesto";