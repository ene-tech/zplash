CREATE TABLE "cierres_caja" (
	"fecha" text PRIMARY KEY NOT NULL,
	"cerrado_por" text NOT NULL,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resumen" jsonb NOT NULL,
	"notas" text
);
