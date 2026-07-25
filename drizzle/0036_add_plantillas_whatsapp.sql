CREATE TABLE "plantillas_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"mensaje" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
