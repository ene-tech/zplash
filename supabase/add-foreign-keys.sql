-- Corre esto una sola vez en el SQL Editor de Supabase: agrega integridad
-- referencial real donde es segura (ver evaluación previa — cliente_id y
-- cupon_codigo son los únicos casos sin filas huérfanas "irreconciliables";
-- creado_por/categoria/plan quedan pendientes porque tienen valores
-- sintéticos o históricos que no calzan con una FK).
--
-- 1) Normaliza el sentinel "" (string vacío, usado a propósito en "Lavado
--    sin registro" / "Cupón Venta Empresa" para representar "sin cliente")
--    a NULL real. El código ya se actualizó (src/lib/db.ts) para nunca
--    volver a guardar "" — esto solo limpia lo que ya había en la tabla.
update ingresos set cliente_id = null where cliente_id = '';
update ventas set cliente_id = null where cliente_id = '';

-- 2) Desvincula referencias a clientes/cupones que ya no existen (se
--    verificó: son 12 filas de prueba con clientes borrados después, más 1
--    ingreso con un cupón que ya no existe). Se pone en NULL, NO se borra
--    el ingreso/venta/empresa — se preserva el historial, mismo criterio
--    que ya usaba el diseño original de este esquema.
update ingresos set cliente_id = null
  where cliente_id is not null
  and not exists (select 1 from clientes c where c.id = ingresos.cliente_id);
update ventas set cliente_id = null
  where cliente_id is not null
  and not exists (select 1 from clientes c where c.id = ventas.cliente_id);
update empresas set contacto_cliente_id = null
  where contacto_cliente_id is not null
  and not exists (select 1 from clientes c where c.id = empresas.contacto_cliente_id);
update ingresos set cupon_codigo = null
  where cupon_codigo is not null
  and not exists (select 1 from cupones c where c.codigo = ingresos.cupon_codigo);

-- 3) Agrega las FK. ON DELETE SET NULL: si se borra el cliente/cupón
--    referenciado, el ingreso/venta/empresa queda desvinculado pero no se
--    borra — igual que el comportamiento manual que ya existía.
alter table ingresos drop constraint if exists ingresos_cliente_id_fkey;
alter table ingresos add constraint ingresos_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;

alter table ventas drop constraint if exists ventas_cliente_id_fkey;
alter table ventas add constraint ventas_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;

alter table empresas drop constraint if exists empresas_contacto_cliente_id_fkey;
alter table empresas add constraint empresas_contacto_cliente_id_fkey
  foreign key (contacto_cliente_id) references clientes(id) on delete set null;

alter table ingresos drop constraint if exists ingresos_cupon_codigo_fkey;
alter table ingresos add constraint ingresos_cupon_codigo_fkey
  foreign key (cupon_codigo) references cupones(codigo) on delete set null;
