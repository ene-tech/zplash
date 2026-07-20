-- Agrega a "config" la escala de precio de renovación preferencial por
-- visitas para clientes Local (ver TramoRenovacionLocal/precioRenovacionLocal
-- en @/types y @/lib/helpers, y la sección "Precios y renovación
-- preferencial" en ConfigTab.tsx). Permite, por ejemplo, ofrecer $16.990 a
-- quienes pasaron 0 o 1 vez, en vez de un único precio de promoción para
-- todos los clientes Local.
--
-- Generado también como migración Drizzle (ver drizzle/0013_condemned_sentinel.sql);
-- este script queda como referencia para aplicar a mano contra bases que no
-- corran "npm run db:migrate" (mismo criterio que el resto de los archivos
-- add-*.sql de esta carpeta).

alter table config add column if not exists tramos_renovacion_local jsonb not null default '{}'::jsonb;
