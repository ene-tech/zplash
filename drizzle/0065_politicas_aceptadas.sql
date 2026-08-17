CREATE TABLE "politicas_aceptadas" (
	"email" text NOT NULL,
	"version" text NOT NULL,
	"aceptado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politicas_aceptadas_email_version_pk" PRIMARY KEY("email","version")
);
