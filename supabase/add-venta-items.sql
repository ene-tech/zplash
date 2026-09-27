-- POS de productos (tienda): líneas de venta + canal de ingreso propio.
--
-- Qué hace: crea la tabla venta_items, donde cada fila es una línea de un
-- ticket del POS (qué producto, cuántas unidades, a qué precio). La venta
-- en sí sigue siendo una fila de `ventas` como cualquier otra, con
-- tipo = 'Venta de productos'.
--
-- Qué NO toca: ninguna tabla existente. No altera `ventas`, `productos` ni
-- `movimientos_contables`; solo agrega una tabla nueva y una fila de
-- categoría de ingreso.
--
-- Idempotente: se puede volver a correr sin romper nada.

create table if not exists venta_items (
  id text primary key,
  -- cascade: las líneas no existen sin su ticket.
  venta_id text not null references ventas(id) on delete cascade,
  -- set null: si el producto se borra del catálogo, la boleta histórica
  -- conserva sku/detalle (son snapshot al momento de la venta).
  producto_id text references productos(id) on delete set null,
  sku text not null,
  detalle text not null,
  cantidad integer not null,
  precio_unitario numeric not null
);

create index if not exists venta_items_venta_id_idx on venta_items (venta_id);

-- Misma política que el resto: la app escribe por Server Actions con
-- DATABASE_URL (se salta RLS). Sin policies para anon = denegado desde el
-- navegador.
alter table venta_items enable row level security;

-- Canal de ingreso de la tienda, para que el EERR no mezcle productos con
-- lavado (ver CANAL_INGRESO_PRODUCTOS en src/lib/helpers/contabilidad.ts).
-- Sin target a propósito: `nombre` también es unique, así que si alguien ya
-- creó ese canal a mano desde Contabilidad, el insert no debe reventar (todo
-- el archivo corre en una sola transacción y se perdería la tabla nueva).
insert into categorias_ingreso (id, nombre, activa)
values ('ci-productos', 'Venta de Productos', true)
on conflict do nothing;
