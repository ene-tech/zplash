-- Fabricación propia (pestaña "Fabricación"): lo que fabricamos nosotros con
-- nuestras materias primas se guarda como una recepción marcada propia = true
-- (sin fábrica, maquila ni egreso). Ver src/db/schema/inventario/fabricacion.ts.
--
-- Qué hace: agrega la columna; las recepciones que ya existen quedan en false
-- (siguen siendo de la fábrica).
-- Qué NO toca: ningún dato existente, stock, lotes ni contabilidad.
-- Se puede pegar dos veces.
-- Va ANTES del deploy: cargarFabricacion lee la columna.

alter table recepciones_fabrica add column if not exists propia boolean not null default false;
