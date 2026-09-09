-- Proveedor Brajovic (factura 1073463, 31-ago-2026) + vincular sus 16 productos.
--
-- Dónde: SQL Editor de Supabase, pegar completo y Run una vez.
-- Requisito: haber corrido antes carga-productos-sept2026.sql (los productos
--   ya deben existir; si no, el UPDATE no encuentra filas y queda en 0).
-- Qué hace: crea el proveedor si no existe (busca por RUT, se puede correr
--   dos veces sin duplicar) y les pone proveedor a los 16 códigos cargados.
-- Qué responde: "Success. No rows returned".
-- Qué no toca: otros proveedores, ni ningún otro campo de los productos.

insert into proveedores (id, nombre, rut, telefono, email, direccion, contacto, telefono_vendedor, email_comprobantes, creado_por)
select
  'prov-brajovic',
  'Brajovic y Compañía Limitada',
  '77.351.510-7',
  '2227 0228 / 2266 0423',
  'ventas@brajovic.cl',
  'Vasco de Gama 6357, esquina Los Molineros, Peñalolén, Santiago',
  'José Arriagada (vendedor cód. 269)',
  '+56 9 3005 9611',
  'clientes@brajovic.cl',
  'Carga factura sept-2026'
where not exists (select 1 from proveedores where rut = '77.351.510-7');

update productos
set proveedor_id = (select id from proveedores where rut = '77.351.510-7' limit 1)
where codigo in (
  '101005', '107013', '107016', '111001', '111005', '121004',
  '22605', '22680', '22688', '99500', '99604', '99605',
  '99680', '99682', '99687', '99688'
);
