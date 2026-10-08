-- Carga inicial del módulo Fabricación desde "FORMULA PRODUCTOS ZUPER.xlsx".
-- Va DESPUÉS de fabricacion-v2-2026-10-07.sql.
--
-- Qué hace: crea las materias primas (con el precio de la planilla como
-- precio de la fábrica, salvo las que compramos nosotros) y 4 fórmulas.
-- No crea presentaciones (a qué producto suma cada formato): eso se arma en
-- la pantalla. No carga stock: lo nuestro entra con "Registrar compra".
-- Qué NO toca: productos, insumos, contabilidad.
-- Se puede pegar dos veces (on conflict do nothing).

insert into materias_primas (id, nombre, unidad, precio_fabrica) values
  -- Nuestras: la fábrica no las pone (si faltan, la recepción se bloquea).
  ('mp-fragancia',               'Fragancia',                               'L',  null),
  ('mp-cera-carnauba',           'Cera carnauba',                           'kg', null),
  ('mp-cera-carnauba-silicona',  'Cera carnauba / silicona',                'kg', null),
  ('mp-silicona-aminofuncional', 'Silicona aminofuncional',                 'L',  null),
  ('mp-aceite-silicona-pdms',    'Aceite de silicona PDMS 1000',            'L',  null),
  -- Envases: los compramos nosotros.
  ('mp-frasco',                  'Frasco',                                  'un', null),
  ('mp-botella-bazooka-500',     'Botella Bazooka 500 cc',                  'un', null),
  ('mp-atomizador',              'Atomizador',                              'un', null),
  ('mp-etiqueta',                'Etiqueta',                                'un', null),
  -- El resto: precio de la planilla como precio de la fábrica (editable).
  ('mp-alcohol',                 'Alcohol',                                 'L',  2300),
  ('mp-alcohol-isopropilico',    'Alcohol isopropílico',                    'L',  2300),
  ('mp-agua',                    'Agua',                                    'L',  200),
  ('mp-agua-destilada',          'Agua destilada',                          'L',  200),
  ('mp-emulsionante',            'Emulsionante',                            'L',  3000),
  ('mp-proside',                 'Proside (preservante)',                   'L',  2800),
  ('mp-glicerina',               'Glicerina (humectante)',                  'L',  2000),
  ('mp-carboximetilcelulosa',    'Carboximetilcelulosa (espesante)',        'kg', 5000),
  ('mp-butilglicol',             'Butilglicol (solvente)',                  'L',  3000),
  ('mp-isopar',                  'Isopar',                                  'L',  3500),
  ('mp-amonio-cuaternario',      'Amonio cuaternario (cloruro de cetrimonio)', 'L', 4750),
  ('mp-cera-acrilica',           'Cera acrílica',                           'L',  4500),
  ('mp-acido-citrico',           'Ácido cítrico',                           'kg', 4000)
on conflict do nothing;

insert into formulas (id, nombre, notas) values
  ('f-fragancia',          'Fragancia',                       'Planilla ZUPER, hoja FRAGANCIA 120'),
  ('f-renovador-tablero',  'Renovador de tablero (acabado)',  'Planilla ZUPER. Suma 99,6%: la carboximetilcelulosa no tenía %'),
  ('f-limpia-vidrios',     'Limpia vidrios',                  'Planilla ZUPER. OJO: mezcla idéntica a Fragancia, revisar'),
  ('f-cera-tunel',         'Cera túnel',                      'Planilla ZUPER, hoja cera tunel1')
on conflict do nothing;

insert into formula_componentes (id, formula_id, materia_prima_id, porcentaje) values
  ('fc-fragancia-1', 'f-fragancia', 'mp-fragancia', 8),
  ('fc-fragancia-2', 'f-fragancia', 'mp-alcohol', 70),
  ('fc-fragancia-3', 'f-fragancia', 'mp-agua', 15),
  ('fc-fragancia-4', 'f-fragancia', 'mp-emulsionante', 7),

  ('fc-tablero-1', 'f-renovador-tablero', 'mp-fragancia', 3),
  ('fc-tablero-2', 'f-renovador-tablero', 'mp-proside', 0.1),
  ('fc-tablero-3', 'f-renovador-tablero', 'mp-glicerina', 3),
  ('fc-tablero-4', 'f-renovador-tablero', 'mp-butilglicol', 0.5),
  ('fc-tablero-5', 'f-renovador-tablero', 'mp-alcohol-isopropilico', 5),
  ('fc-tablero-6', 'f-renovador-tablero', 'mp-cera-carnauba-silicona', 20),
  ('fc-tablero-7', 'f-renovador-tablero', 'mp-agua', 68),

  ('fc-vidrios-1', 'f-limpia-vidrios', 'mp-fragancia', 7),
  ('fc-vidrios-2', 'f-limpia-vidrios', 'mp-alcohol', 70),
  ('fc-vidrios-3', 'f-limpia-vidrios', 'mp-emulsionante', 7),
  ('fc-vidrios-4', 'f-limpia-vidrios', 'mp-agua', 16),

  ('fc-cera-1', 'f-cera-tunel', 'mp-cera-carnauba', 14),
  ('fc-cera-2', 'f-cera-tunel', 'mp-silicona-aminofuncional', 5),
  ('fc-cera-3', 'f-cera-tunel', 'mp-amonio-cuaternario', 9),
  ('fc-cera-4', 'f-cera-tunel', 'mp-alcohol-isopropilico', 3),
  ('fc-cera-5', 'f-cera-tunel', 'mp-cera-acrilica', 5),
  ('fc-cera-6', 'f-cera-tunel', 'mp-acido-citrico', 1),
  ('fc-cera-7', 'f-cera-tunel', 'mp-agua-destilada', 63)
on conflict do nothing;
