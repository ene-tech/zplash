-- SMS como canal paralelo a WhatsApp para campañas (ver mensajesSms en
-- @/db/schema/sms): una fila por SMS enviado o intentado, con la campaña a la
-- que pertenece y el código del link de baja del pie del mensaje.
CREATE TABLE IF NOT EXISTS "mensajes_sms" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text REFERENCES "clientes"("id") ON DELETE SET NULL,
	"telefono" text NOT NULL,
	"campana" text NOT NULL,
	"texto" text NOT NULL,
	"segmentos" integer NOT NULL,
	"estado" text NOT NULL,
	"proveedor_id" text,
	"codigo_baja" text NOT NULL UNIQUE,
	"enviado_por" text,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mensajes_sms_campana_idx" ON "mensajes_sms" USING btree ("campana");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mensajes_sms_cliente_idx" ON "mensajes_sms" USING btree ("cliente_id");--> statement-breakpoint
-- Sin políticas, como el resto: se lee y escribe solo por DATABASE_URL.
ALTER TABLE "mensajes_sms" ENABLE ROW LEVEL SECURITY;
