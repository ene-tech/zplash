-- Tipos en "Materias Primas, Insumos y Mano de Obra" (Fabricación).
--
-- Qué hace:
--  1. Agrega `tipo` (materia_prima | insumo | mano_obra) y `costo_mano_obra`
--     a materias_primas. Todo lo que existe queda como materia prima...
--  2. ...salvo los 4 envases de la carga inicial (frasco, botella, atomizador,
--     etiqueta), que pasan a "insumo". Solo si siguen como materia prima.
-- Qué NO toca: stock, lotes, fórmulas, recepciones ni contabilidad.
-- Se puede pegar dos veces. Va ANTES del deploy: la app lee las columnas.

alter table materias_primas add column if not exists tipo text not null default 'materia_prima';
alter table materias_primas add column if not exists costo_mano_obra numeric;

update materias_primas set tipo = 'insumo'
where id in ('mp-frasco', 'mp-botella-bazooka-500', 'mp-atomizador', 'mp-etiqueta') and tipo = 'materia_prima';
