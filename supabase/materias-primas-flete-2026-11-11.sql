-- Fabricación: flete en la ficha de materia prima / insumo (costo total neto
-- y cantidad transportada) para prorratearlo sobre el valor neto de compra.
alter table materias_primas add column if not exists flete_total numeric;
alter table materias_primas add column if not exists flete_cantidad numeric;
