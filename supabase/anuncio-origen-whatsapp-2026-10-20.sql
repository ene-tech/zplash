-- Guarda en cada conversación de WhatsApp el primer anuncio de Meta
-- (Click-to-WhatsApp) desde el que escribió ese número. Ver anuncioOrigen en
-- src/db/schema/whatsapp.ts. Va ANTES del deploy (si falta, el webhook solo
-- deja un error en el log y sigue contestando).
alter table conversaciones_whatsapp add column if not exists anuncio_origen jsonb;
alter table conversaciones_whatsapp add column if not exists anuncio_origen_en timestamptz;
