CREATE TABLE "disparos_regla_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"regla_id" text NOT NULL,
	"origen_tipo" text NOT NULL,
	"origen_id" text NOT NULL,
	"cliente_id" text,
	"patente" text,
	"cupon_id" text,
	"mensaje_whatsapp_id" text,
	"estado" text DEFAULT 'programado' NOT NULL,
	"enviar_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disparos_regla_whatsapp_regla_origen_unq" UNIQUE("regla_id","origen_tipo","origen_id")
);
--> statement-breakpoint
CREATE TABLE "reglas_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"tipo_evento" text NOT NULL,
	"condicion_tipo_venta" text,
	"condicion_planes" jsonb,
	"condicion_dias_antes_vencimiento" integer,
	"delay_dias" integer DEFAULT 0 NOT NULL,
	"accion" text NOT NULL,
	"cupon_es_porcentaje" boolean DEFAULT false NOT NULL,
	"cupon_valor" numeric,
	"cupon_validez_dias" integer,
	"plantilla_whatsapp_id" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text
);
--> statement-breakpoint
ALTER TABLE "plantillas_whatsapp" ADD COLUMN "meta_nombre" text;--> statement-breakpoint
ALTER TABLE "plantillas_whatsapp" ADD COLUMN "meta_idioma" text;--> statement-breakpoint
ALTER TABLE "plantillas_whatsapp" ADD COLUMN "meta_variables" jsonb;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_regla_id_reglas_whatsapp_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_whatsapp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_cupon_id_cupones_id_fk" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos_regla_whatsapp" ADD CONSTRAINT "disparos_regla_whatsapp_mensaje_whatsapp_id_mensajes_whatsapp_id_fk" FOREIGN KEY ("mensaje_whatsapp_id") REFERENCES "public"."mensajes_whatsapp"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_whatsapp" ADD CONSTRAINT "reglas_whatsapp_plantilla_whatsapp_id_plantillas_whatsapp_id_fk" FOREIGN KEY ("plantilla_whatsapp_id") REFERENCES "public"."plantillas_whatsapp"("id") ON DELETE no action ON UPDATE no action;