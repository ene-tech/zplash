CREATE TABLE "conversaciones_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"telefono" text NOT NULL,
	"cliente_id" text,
	"nombre_contacto" text,
	"ultimo_mensaje_en" timestamp with time zone DEFAULT now() NOT NULL,
	"no_leidos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversaciones_whatsapp_telefono_unique" UNIQUE("telefono")
);
--> statement-breakpoint
CREATE TABLE "mensajes_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"conversacion_id" text NOT NULL,
	"direccion" text NOT NULL,
	"texto" text NOT NULL,
	"tipo" text DEFAULT 'texto' NOT NULL,
	"estado" text,
	"whatsapp_message_id" text,
	"enviado_por" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_conversacion_id_conversaciones_whatsapp_id_fk" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones_whatsapp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensajes_whatsapp_conversacion_fecha_idx" ON "mensajes_whatsapp" USING btree ("conversacion_id","creado_en");