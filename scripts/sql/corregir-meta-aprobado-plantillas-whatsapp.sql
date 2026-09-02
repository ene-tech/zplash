-- Corrige el flag `meta_aprobado` de 3 plantillas que Meta YA tiene aprobadas.
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano).
--
-- POR QUÉ: `meta_aprobado` es una marca MANUAL que se pone a mano en
-- Web Settings → WhatsApp Plantillas, no se sincroniza con Meta. Quedó en
-- `false` en 3 plantillas que en realidad están APPROVED hace rato, y eso hizo
-- creer que faltaban templates por aprobar cuando no faltaba ninguno.
-- Verificado el 02-09-2026 contra la Graph API:
--
--   npx tsx --env-file=.env.local scripts/templates-meta.mts
--
--   APPROVED  UTILITY    es_CL  confirmacion_renovacion_plan
--   APPROVED  UTILITY    es_CL  confirmacion_reactivacion_plan
--   APPROVED  MARKETING  es_CL  recordatorio_vencimiento_plan
--
-- QUÉ HACE: pone el flag en true en esas 3, para que la pantalla de plantillas
-- muestre lo mismo que Meta.
--
-- QUÉ RESPONDE: "UPDATE 3".
--
-- QUÉ NO TOCA: NADA del envío. El motor de reglas nunca mira este flag — la
-- única condición para poder mandar es tener `meta_nombre` (ver
-- enviarSegunPlantilla en @/lib/whatsapp/reglas/motor.ts). Este update es
-- solamente cosmético: no prende reglas, no manda mensajes, no cambia textos.
--
-- OJO APARTE (no lo arregla este SQL): `recordatorio_vencimiento_plan` está
-- categorizado por Meta como MARKETING, no UTILITY. Un recordatorio de
-- vencimiento es utilitario, y como MARKETING cuesta más y cae bajo las reglas
-- de opt-out. Se pide la re-categorización en Meta Business Manager, no acá.

update plantillas_whatsapp
set meta_aprobado = true
where meta_nombre in (
  'confirmacion_renovacion_plan',
  'confirmacion_reactivacion_plan',
  'recordatorio_vencimiento_plan'
);
