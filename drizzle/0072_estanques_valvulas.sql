CREATE TABLE "estanques" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"contenido" text,
	"capacidad_litros" numeric NOT NULL,
	"offset_crudo" numeric DEFAULT 0 NOT NULL,
	"litros_por_unidad" numeric DEFAULT 1 NOT NULL,
	"umbral_bajo_litros" numeric,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" text,
	CONSTRAINT "estanques_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "lecturas_estanque" (
	"id" text PRIMARY KEY NOT NULL,
	"estanque_id" text NOT NULL,
	"crudo" numeric NOT NULL,
	"medido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valvulas" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"estanque_id" text,
	"abierta" boolean DEFAULT false NOT NULL,
	"cambiado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cambiado_por" text,
	"confirmada_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "valvulas_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "lecturas_estanque" ADD CONSTRAINT "lecturas_estanque_estanque_id_estanques_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valvulas" ADD CONSTRAINT "valvulas_estanque_id_estanques_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lecturas_estanque_estanque_idx" ON "lecturas_estanque" USING btree ("estanque_id","medido_en");--> statement-breakpoint
CREATE INDEX "valvulas_estanque_idx" ON "valvulas" USING btree ("estanque_id");--> statement-breakpoint
-- Sin políticas, igual que el resto de las tablas: toda la lectura/escritura
-- pasa por Server Actions (y por /api/estanques/telemetria, autenticada con
-- ESTANQUES_SECRET) contra DATABASE_URL, que se salta RLS. La anon key del
-- bundle no debe poder tocar nada: sin esto, cualquiera con esa key podría
-- leer la API REST auto-generada de Supabase y —peor— escribir en `valvulas`,
-- que es abrir una llave de agua del local desde internet. Ver
-- supabase/rls-tablas-faltantes-2026-08-11.sql.
ALTER TABLE "estanques" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lecturas_estanque" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "valvulas" ENABLE ROW LEVEL SECURITY;
