-- Seed de la BASE DE PRUEBAS de zplash. Datos inventados: ningún cliente,
-- teléfono ni correo real. Pegar DESPUÉS del esquema. Idempotente.
--
-- Perfiles y su clave (la misma para los dos): pruebas-2026
--   Gerencia (todos los módulos) · Cajero (operador + pos cuando exista)

insert into perfiles (id, nombre, clave, modulos) values
  ('p-gerencia', 'Gerencia', '$2b$10$vhO5bWfEI3jqYbFtzaNfceAungg8UcHUjFdArZZb8YKh29VbT.0zq',
   '["operador","servicios","clientes","suscripciones","ingresos","cierre","empresa","empresas_facturacion","perfiles","stats","config","contabilidad","permisos","arqueo","agenda","web_settings","inventario","mantencion","estanques","mensajes","correo","funcionario"]'::jsonb),
  ('p-cajero', 'Cajero', '$2b$10$vhO5bWfEI3jqYbFtzaNfceAungg8UcHUjFdArZZb8YKh29VbT.0zq',
   '["operador","servicios","funcionario"]'::jsonb)
on conflict (id) do nothing;

-- Fila singleton de configuración (toma los defaults del esquema).
insert into config (id) values (true) on conflict (id) do nothing;

-- Categorías de ingreso: las mismas que CATEGORIAS_INGRESO_DEFAULT.
insert into categorias_ingreso (id, nombre, activa) values
  ('ci-tunel', 'Servicios de Lavado / Túnel', true),
  ('ci-otros', 'Otros', true)
on conflict (id) do nothing;

-- Inventario: bodega + categoría + 3 productos inventados de detailing.
insert into destinos_inventario (id, nombre, es_bodega, activo) values
  ('dest-bodega', 'Bodega', true, true)
on conflict (id) do nothing;

insert into categorias_producto (id, nombre, activa) values
  ('cat-detailing', 'Detailing', true)
on conflict (id) do nothing;

insert into productos (id, codigo, sku, detalle, categoria_id, valor_compra, valor_venta, stock, stock_min, stock_max, empaque_minimo, activo) values
  ('prod-cera', '900001', 'CERA-500', 'Cera líquida 500 ml (prueba)', 'cat-detailing', 4500, 9990, 20, 5, 60, 1, true),
  ('prod-shampoo', '900002', 'SHAMPOO-1L', 'Shampoo pH neutro 1 L (prueba)', 'cat-detailing', 3200, 6990, 15, 4, 40, 1, true),
  ('prod-pano', '900003', 'PANO-MF', 'Paño microfibra (prueba)', 'cat-detailing', 900, 2990, 50, 10, 100, 1, true)
on conflict (id) do nothing;

-- Clientes inventados, para probar el POS con cliente asociado.
insert into clientes (id, nombre, patente, telefono, email, vehiculo) values
  ('cli-prueba-1', 'Cliente Prueba Uno', 'PRUE01', '+56900000001', 'prueba1@ejemplo.cl', 'Auto de prueba'),
  ('cli-prueba-2', 'Cliente Prueba Dos', 'PRUE02', '+56900000002', 'prueba2@ejemplo.cl', 'Auto de prueba')
on conflict (id) do nothing;

-- Empresa inventada, para probar la venta con factura.
insert into empresas (id, razon_social, rut, giro, direccion, telefono) values
  ('emp-prueba', 'Empresa de Prueba SpA', '76.000.000-0', 'Servicios', 'Calle Falsa 123', '+56900000003')
on conflict (id) do nothing;
