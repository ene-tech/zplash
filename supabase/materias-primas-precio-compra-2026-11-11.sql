-- Fabricación: valor neto de compra por unidad (ej. valor del litro) en la
-- ficha de materia prima. Solo precarga el costo de las compras.
alter table materias_primas add column if not exists precio_compra numeric;
