CREATE TABLE "otps_cliente" (
	"id" text PRIMARY KEY NOT NULL,
	"telefono" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_en" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_cliente_id_unq" UNIQUE("endpoint","cliente_id")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otps_cliente_telefono_idx" ON "otps_cliente" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX "push_subscriptions_cliente_id_idx" ON "push_subscriptions" USING btree ("cliente_id");