CREATE TABLE "reglas_filtro_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"combinador" text DEFAULT 'todas' NOT NULL,
	"condiciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accion" text NOT NULL,
	"carpeta_destino" text,
	"detener_evaluacion" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
