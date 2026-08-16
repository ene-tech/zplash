CREATE TABLE "correos_automaticos" (
	"id" text PRIMARY KEY NOT NULL,
	"de" text NOT NULL,
	"para" text NOT NULL,
	"asunto" text NOT NULL,
	"html" text NOT NULL,
	"estado" text NOT NULL,
	"error" text,
	"proveedor_id" text,
	"disparo_id" text,
	"cliente_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correos_automaticos" ADD CONSTRAINT "correos_automaticos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correos_automaticos_creado_en_idx" ON "correos_automaticos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "correos_automaticos_cliente_id_idx" ON "correos_automaticos" USING btree ("cliente_id");--> statement-breakpoint
-- Agregado a mano sobre lo que generó drizzle-kit (que no maneja RLS), mismo
-- criterio que supabase/rls-tablas-faltantes-2026-08-11.sql: RLS habilitada y
-- sin políticas = denegado por defecto para la anon key pública del bundle;
-- la app escribe y lee por DATABASE_URL, que se salta RLS. Acá importa
-- especialmente porque la tabla guarda el email del destinatario y el cuerpo
-- completo de cada correo enviado.
ALTER TABLE "correos_automaticos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- De paso, las dos tablas del motor de correo que se crearon después de aquel
-- script (ver drizzle/0057_sweet_gambit.sql) y quedaron fuera de esa pasada.
ALTER TABLE "reglas_correo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "disparos_regla_correo" ENABLE ROW LEVEL SECURITY;