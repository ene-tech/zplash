-- Libro de reclamos, sugerencias y felicitaciones del Portal Cliente (ver
-- @/db/schema/libro). Lo escribe el cliente logueado por OTP desde Mi Cuenta
-- (/api/cliente/libro) y lo lee el panel: la vista "Libro" del menú de inicio
-- y la ficha de cliente, que filtra por email.
CREATE TABLE IF NOT EXISTS "libro_comentarios" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"tipo" text NOT NULL,
	"mensaje" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
-- La ficha de cliente consulta por email cada vez que se abre.
CREATE INDEX IF NOT EXISTS "libro_comentarios_email_idx" ON "libro_comentarios" USING btree ("email");--> statement-breakpoint
-- Sin políticas, igual que el resto de las tablas: toda la lectura/escritura
-- pasa por Server Actions y por /api/cliente/libro (sesión OTP) contra
-- DATABASE_URL, que se salta RLS. La anon key del bundle no debe poder leer
-- reclamos ajenos ni escribir. Ver supabase/rls-tablas-faltantes-2026-08-11.sql.
ALTER TABLE "libro_comentarios" ENABLE ROW LEVEL SECURITY;
