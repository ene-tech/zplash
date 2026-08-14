CREATE TABLE "disparos_regla_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"regla_id" text NOT NULL,
	"origen_tipo" text NOT NULL,
	"origen_id" text NOT NULL,
	"cliente_id" text,
	"patente" text,
	"estado" text DEFAULT 'programado' NOT NULL,
	"error" text,
	"enviar_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disparos_regla_correo_regla_origen_unq" UNIQUE("regla_id","origen_tipo","origen_id")
);
--> statement-breakpoint
CREATE TABLE "reglas_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"tipo_evento" text NOT NULL,
	"condicion_tipo_venta" text,
	"condicion_planes" jsonb,
	"condicion_dias_antes_vencimiento" integer,
	"delay_dias" integer DEFAULT 0 NOT NULL,
	"plantilla_correo_id" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
ALTER TABLE "disparos_regla_correo" ADD CONSTRAINT "disparos_regla_correo_regla_id_reglas_correo_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_correo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_correo" ADD CONSTRAINT "disparos_regla_correo_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_correo" ADD CONSTRAINT "reglas_correo_plantilla_correo_id_plantillas_correo_id_fk" FOREIGN KEY ("plantilla_correo_id") REFERENCES "public"."plantillas_correo"("id") ON DELETE no action ON UPDATE no action;