-- Fórmula "Renovador plásticos ext. y neumáticos" tal como viene en la planilla
-- ZUPER (hoja REN. PLASTICOS EXT Y NEUMATICOS), a pedido del usuario aunque
-- suma 155%: la mezcla de Fragancia (100%) + Isopar 55%. El aceite de
-- silicona PDMS 1000 no tenía % y queda fuera.
--
-- Qué hace: agrega esa fórmula con sus 5 componentes.
-- Qué NO toca: las otras fórmulas, materias primas, productos ni contabilidad.
-- Se puede pegar dos veces (on conflict do nothing).

insert into formulas (id, nombre, notas) values
  ('f-renovador-plasticos-neumaticos', 'Renovador plásticos ext. y neumáticos',
   'Planilla ZUPER. OJO: suma 155% (Isopar 55% sobre la mezcla de Fragancia); falta el % del aceite de silicona PDMS 1000. Corregir antes de usar')
on conflict do nothing;

insert into formula_componentes (id, formula_id, materia_prima_id, porcentaje) values
  ('fc-plasticos-1', 'f-renovador-plasticos-neumaticos', 'mp-fragancia', 7),
  ('fc-plasticos-2', 'f-renovador-plasticos-neumaticos', 'mp-alcohol', 70),
  ('fc-plasticos-3', 'f-renovador-plasticos-neumaticos', 'mp-emulsionante', 7),
  ('fc-plasticos-4', 'f-renovador-plasticos-neumaticos', 'mp-agua', 16),
  ('fc-plasticos-5', 'f-renovador-plasticos-neumaticos', 'mp-isopar', 55)
on conflict do nothing;
