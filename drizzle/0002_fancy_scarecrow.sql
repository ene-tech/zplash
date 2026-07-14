CREATE TABLE "bloqueos_agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"todo_el_dia" boolean DEFAULT true NOT NULL,
	"hora_inicio" text,
	"hora_fin" text,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "cita_servicios" (
	"id" text PRIMARY KEY NOT NULL,
	"cita_id" text NOT NULL,
	"servicio_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"patente" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"fecha_hora" timestamp with time zone NOT NULL,
	"duracion_minutos" integer NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"origen" text DEFAULT 'interno' NOT NULL,
	"creado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"duracion_minutos" integer DEFAULT 30 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;