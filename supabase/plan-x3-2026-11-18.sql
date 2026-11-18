-- Plan X3 (18-nov-2026): cada tarjeta con cobro automático guarda qué plan
-- cobra. Vacío = Plan X5 (todas las suscripciones que ya existen).
-- Va ANTES del deploy: /inscribir y el cron leen esta columna.
alter table suscripciones_oneclick add column if not exists plan text;
