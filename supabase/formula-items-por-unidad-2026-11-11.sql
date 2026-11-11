-- Fabricación: insumos y mano de obra en la fórmula por unidad producida
-- (no en % de la mezcla). Con valor, la fila es un ítem por unidad.
alter table formula_componentes add column if not exists cantidad_por_unidad numeric;
