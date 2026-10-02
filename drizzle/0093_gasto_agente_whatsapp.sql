-- Contador de gasto del agente de WhatsApp con IA (ver gastoAgenteWhatsapp en
-- @/db/schema/whatsapp): una fila por mensaje que atiende, con lo que cobra
-- Anthropic. Lo escribe el webhook /api/whatsapp y lo suma Historial WhatsApp.
CREATE TABLE IF NOT EXISTS "gasto_agente_whatsapp" (
	"id" text PRIMARY KEY NOT NULL,
	"conversacion_id" text REFERENCES "conversaciones_whatsapp"("id") ON DELETE SET NULL,
	"modelo" text NOT NULL,
	"costo_usd" numeric(10, 5) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gasto_agente_whatsapp_creado_en_idx" ON "gasto_agente_whatsapp" USING btree ("creado_en");--> statement-breakpoint
-- Sin políticas, como el resto: se lee y escribe solo por DATABASE_URL.
ALTER TABLE "gasto_agente_whatsapp" ENABLE ROW LEVEL SECURITY;
