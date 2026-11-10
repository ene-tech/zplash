-- Etiquetas en los chats de WhatsApp (Mensajes): texto libre para saber de qué
-- se trata cada conversación; se quitan cuando el tema se resuelve.
-- Va ANTES del deploy: listarConversaciones lee la columna.
alter table conversaciones_whatsapp
  add column if not exists etiquetas text[] not null default '{}'::text[];
