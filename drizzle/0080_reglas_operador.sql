CREATE TABLE "reglas_operador" (
	"id" text PRIMARY KEY NOT NULL,
	"dias" text NOT NULL,
	"hora_desde" text NOT NULL,
	"hora_hasta" text NOT NULL,
	"notas" text
);
--> statement-breakpoint
ALTER TABLE "reglas_operador" ADD CONSTRAINT "reglas_operador_id_perfiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;