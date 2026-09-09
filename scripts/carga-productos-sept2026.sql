-- Carga del catálogo de productos (factura proveedor sept-2026) al inventario.
--
-- Dónde: SQL Editor de Supabase (proyecto de producción), pegar completo y Run una vez.
-- Qué hace: crea las categorías que falten (AROMATIZANTE, CERA, LIMPIEZA,
--   NEUMATICOS, SILICONA) y agrega los 16 productos con su costo neto,
--   precio de venta público (IVA incluido) y stock inicial.
-- Qué responde: "Success. No rows returned". Después, en Inventario →
--   Productos deben aparecer los 16 (refrescar la app).
-- Qué no toca: productos ya existentes (si un código ya está cargado, esa
--   fila se salta), stock de otros productos, ventas, nada fuera de las
--   tablas categorias_producto y productos.
-- Si falla con "productos_sku_unique": ya existe un producto con ese mismo
--   nombre de SKU — no se carga nada (todo o nada); revisar cuál choca.
--
-- El margen NO se guarda: la app lo calcula sola (venta neta − costo) y lo
-- muestra en Inventario → Productos. El Red Kiss (121004) queda sin precio
-- de venta (0) porque la planilla no lo trae; se le pone al editarlo.

insert into categorias_producto (id, nombre) values
  ('cat-aromatizante', 'AROMATIZANTE'),
  ('cat-cera', 'CERA'),
  ('cat-limpieza', 'LIMPIEZA'),
  ('cat-neumaticos', 'NEUMATICOS'),
  ('cat-silicona', 'SILICONA')
on conflict (nombre) do nothing;

insert into productos (id, codigo, sku, detalle, categoria_id, valor_compra, valor_venta, stock, creado_por)
select
  'prod-' || v.codigo,
  v.codigo,
  v.nombre,
  v.nombre,
  (select id from categorias_producto where nombre = v.categoria),
  v.costo_neto,
  v.precio_venta,
  v.stock,
  'Carga factura sept-2026'
from (values
  ('101005', 'Aromatizador Botella Tapa de Bambú Piña Colada', 'AROMATIZANTE', 1490, 2490, 32),
  ('107013', 'Aromatizador Colgante Auto Nuevo',               'AROMATIZANTE',  898, 1690, 30),
  ('107016', 'Aromatizador Colgante Tropical Berry',           'AROMATIZANTE',  898, 1690, 30),
  ('111001', 'Aromatizador Botella Tapa de Bambú Vainilla',    'AROMATIZANTE', 1390, 2490, 36),
  ('111005', 'Aromatizador Botella Tapa de Bambú Auto Nuevo',  'AROMATIZANTE', 1390, 2490, 36),
  ('121004', 'Aromatizador para Ventilación Red Kiss',         'AROMATIZANTE', 1590,    0, 36), -- sin precio en la factura
  ('22605',  'Renovador de Neumáticos 650 ml',                 'NEUMATICOS',   1780, 3990, 60),
  ('22680',  'Silicona Aerosol Auto Nuevo 450 ml',             'SILICONA',     1180, 2490, 36),
  ('22688',  'Silicona Aerosol Vainilla 450 ml',               'SILICONA',     1180, 2490, 36),
  ('99500',  'Limpia Tapiz Espuma',                            'LIMPIEZA',     1440, 3990, 36),
  ('99604',  'Cera Spray 420 ml',                              'CERA',         1680, 2990, 36),
  ('99605',  'Renovador de Neumáticos Aerosol 650 ml Grande',  'NEUMATICOS',   1850, 3990, 60),
  ('99680',  'Silicona Aerosol Arlon Auto Nuevo',              'SILICONA',     1390, 2490, 60),
  ('99682',  'Silicona Aerosol Arlon Limón',                   'SILICONA',     1390, 2490, 24),
  ('99687',  'Silicona Aerosol Arlon Manzana',                 'SILICONA',     1390, 2490, 24),
  ('99688',  'Silicona Aerosol Arlon Vainilla',                'SILICONA',     1390, 2490, 60)
) as v(codigo, nombre, categoria, costo_neto, precio_venta, stock)
on conflict (codigo) do nothing;
