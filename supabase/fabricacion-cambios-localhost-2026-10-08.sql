-- Pasa a producción lo que se armó en localhost (base de pruebas) en Fabricación
-- el 8-oct-2026: nombres y categorías de fórmulas, 2 fórmulas nuevas (vacías)
-- y la ficha de la Fragancia.
--
-- Qué NO pasa: stock/lotes, recepciones ni presentaciones (eran de prueba o
-- apuntan a productos inventados de la base de pruebas).
-- Qué NO toca: componentes de las fórmulas, productos, insumos, contabilidad.
-- Se puede pegar dos veces: deja siempre el mismo resultado.

update formulas set nombre = 'Aromatizante Ozonic 120ml', categoria = 'AROMATIZANTES' where id = 'f-fragancia';
update formulas set nombre = 'CERA TUNEL', categoria = 'INSUMOS TUNEL' where id = 'f-cera-tunel';

insert into formulas (id, nombre, categoria) values
  ('c1791463782184899', 'PRELAVADO ALCALINO', 'INSUMOS TUNEL'),
  ('c1791463811102712', 'SHAMPOO NEUTRO', 'INSUMOS TUNEL')
on conflict (id) do update set nombre = excluded.nombre, categoria = excluded.categoria;

update materias_primas set nombre = 'Fragancia (OZONIC)', stock_min = 1, activa = false where id = 'mp-fragancia';
