-- 10-nov-2026: el lavado de chasis pasa a ser "Lavado de Chasis con Ducha
-- Química" (retira barro y óxido) a S/M $29.990 y L/XL $34.990, sin la ducha
-- grafitada, que queda como adicional junto con el transformador de óxido
-- Würth y la antigravilla. Se conserva el id chasis-grafitado (historial y
-- la URL /servicios/chasis-grafitado). Seguro de re-pegar.

update servicios set nombre = 'Lavado de Chasis con Ducha Química'
where id = 'chasis-grafitado';

insert into precios_tamano (servicio_id, s, m, l, xl) values
  ('chasis-grafitado', 29990, 29990, 34990, 34990)
on conflict (servicio_id) do update set s = excluded.s, m = excluded.m, l = excluded.l, xl = excluded.xl;

insert into servicios (id, nombre, categoria, duracion_minutos, activo) values
  ('ducha-grafitada', 'Ducha Grafitada', 'Servicios Adicionales', 30, true),
  ('transformador-oxido-wurth', 'Recubrimiento Transformador de Óxido Würth', 'Servicios Adicionales', 30, true),
  ('antigravilla-bajos', 'Antigravilla y Protector de Bajos', 'Servicios Adicionales', 30, true)
on conflict (id) do update set nombre = excluded.nombre, categoria = excluded.categoria, activo = true;

insert into precios (plan, normal, promo) values
  ('chasis-grafitado', 29990, 0),
  ('ducha-grafitada', 24990, 0),
  ('transformador-oxido-wurth', 99990, 0),
  ('antigravilla-bajos', 199990, 0)
on conflict (plan) do update set normal = excluded.normal, promo = excluded.promo;
