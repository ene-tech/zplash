CREATE TABLE "push_subscripciones_perfil" (
	"id" text PRIMARY KEY NOT NULL,
	"perfil_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_en" timestamp with time zone,
	CONSTRAINT "push_subscripciones_perfil_endpoint_perfil_id_unq" UNIQUE("endpoint","perfil_id")
);
--> statement-breakpoint
ALTER TABLE "push_subscripciones_perfil" ADD CONSTRAINT "push_subscripciones_perfil_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscripciones_perfil_perfil_id_idx" ON "push_subscripciones_perfil" USING btree ("perfil_id");