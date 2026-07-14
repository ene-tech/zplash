CREATE TABLE "cobros_oneclick" (
	"id" text PRIMARY KEY NOT NULL,
	"suscripcion_id" text NOT NULL,
	"ciclo_ym" text NOT NULL,
	"monto" numeric NOT NULL,
	"estado" text NOT NULL,
	"response_code" integer,
	"authorization_code" text,
	"venta_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_webpay" (
	"buy_order" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"patente" text NOT NULL,
	"tipo" text NOT NULL,
	"servicio_id" text,
	"monto" numeric NOT NULL,
	"estado" text DEFAULT 'iniciada' NOT NULL,
	"token" text,
	"authorization_code" text,
	"response_code" integer,
	"venta_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suscripciones_oneclick" (
	"id" text PRIMARY KEY NOT NULL,
	"patente" text NOT NULL,
	"cliente_id" text,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"token_inscripcion" text,
	"tbk_user" text,
	"card_tipo" text,
	"card_ultimos_digitos" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"proximo_cobro" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "suscripciones_oneclick_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "perfiles" ADD COLUMN "clave_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cobros_oneclick" ADD CONSTRAINT "cobros_oneclick_suscripcion_id_suscripciones_oneclick_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones_oneclick"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros_oneclick" ADD CONSTRAINT "cobros_oneclick_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_webpay" ADD CONSTRAINT "pagos_webpay_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones_oneclick" ADD CONSTRAINT "suscripciones_oneclick_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;