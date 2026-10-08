-- Canal de cada regla automática: whatsapp | sms | correo (ver `canal` en
-- src/db/schema/whatsapp.ts). Las reglas existentes quedan en "whatsapp".
ALTER TABLE "reglas_whatsapp" ADD COLUMN IF NOT EXISTS "canal" text DEFAULT 'whatsapp' NOT NULL;
