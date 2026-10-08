-- Categoría en las fórmulas de Fabricación, para agruparlas en pantalla.
--
-- Qué hace: agrega la columna `categoria` (texto libre, opcional) a `formulas`.
-- Las fórmulas que ya existen quedan "Sin categoría" hasta que se les ponga una.
-- Qué NO toca: ningún dato existente.
-- Se puede pegar dos veces (if not exists). Va ANTES del deploy.

alter table formulas add column if not exists categoria text;
