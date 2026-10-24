-- Pasa el precio de venta de los productos de la tienda de bruto (IVA
-- incluido, como se cargaron hasta ahora) a neto. Desde el deploy de
-- bd5ac46 la ficha guarda el neto y el POS cobra neto × 1,19.
-- El neto queda con 2 decimales para que al sumar el IVA vuelva EXACTO al
-- precio de hoy (2.490 → 2.092,44 → cobra 2.490). El cliente paga lo mismo.
-- Pegar JUSTO DESPUÉS del deploy: antes, el POS viejo cobraría el neto.
-- Seguro de re-pegar: el paso 1 solo toca filas cuyo precio sigue igual al
-- del respaldo (la primera vez); la segunda, ya no coinciden y no divide de
-- nuevo. (Mirar si el precio es entero no servía: 5.950 / 1,19 = 5.000.)

-- 0) Antes: 39 filas con precio.
select count(*) as productos from productos where coalesce(valor_venta, 0) > 0;

-- Respaldo para deshacer.
create table if not exists _backup_precios_productos_2026_10_23 as
select id, valor_venta from productos where coalesce(valor_venta, 0) > 0;
alter table _backup_precios_productos_2026_10_23 enable row level security;
revoke all on table _backup_precios_productos_2026_10_23 from anon, authenticated;

-- 1) El cambio.
update productos p
set valor_venta = round(b.valor_venta / 1.19, 2)
from _backup_precios_productos_2026_10_23 b
where p.id = b.id and p.valor_venta = b.valor_venta;

-- 2) Después: "cobra" tiene que ser igual a "antes" en todas las filas.
select p.detalle, b.valor_venta as antes, p.valor_venta as neto, round(p.valor_venta * 1.19) as cobra
from productos p join _backup_precios_productos_2026_10_23 b on b.id = p.id
order by p.detalle;

-- Deshacer:
-- update productos p set valor_venta = b.valor_venta from _backup_precios_productos_2026_10_23 b where p.id = b.id;
