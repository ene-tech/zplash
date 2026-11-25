-- Descuento por seguir a @zplash en Instagram (nov-2026): una fila por cuenta
-- de Instagram que pidió su link, una sola vez por patente. Ver
-- cuponesInstagram en @/db/schema/instagram. Escrito a mano (drizzle/meta está
-- desincronizado, ver la skill sql-supabase).
CREATE TABLE IF NOT EXISTS "cupones_instagram" (
	"ig_id" text PRIMARY KEY NOT NULL,
	"ig_usuario" text,
	"codigo" text NOT NULL UNIQUE,
	"patente" text,
	"cliente_id" text REFERENCES "clientes"("id") ON DELETE SET NULL,
	"cupon_codigo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"activado_en" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "cupones_instagram_patente_unique" ON "cupones_instagram" USING btree ("patente") WHERE "patente" IS NOT NULL;
-- Sin políticas, como el resto: se lee y escribe solo por DATABASE_URL.
ALTER TABLE "cupones_instagram" ENABLE ROW LEVEL SECURITY;
