-- Compradores de la tienda sin auto (oct-2026): clientes.patente pasa a
-- aceptar NULL. Única solo cuando hay patente (índice único parcial) y nunca
-- texto vacío (check). La app guarda "sin patente" como NULL (clienteToRow).
--
-- Va ANTES del deploy del código que da de alta clientes sin patente: si el
-- código sube primero, el alta desde el POS falla con "sin conexión" (NOT NULL).
-- Seguro de re-pegar.

-- ============================================================
-- 0) VERIFICACIÓN PREVIA (solo lectura). Pegar primero y revisar.
-- ============================================================
-- a) Debe responder 0: fichas con patente vacía (el check de
--    abajo las rechazaría y el bloque 1 fallaría entero).
select count(*) as patentes_vacias from clientes where patente = '';
-- b) No debe devolver filas: nada referencia clientes(patente) por FK (si algo la
--    referencia, el drop constraint de abajo falla y hay que verlo antes).
select conname, conrelid::regclass as tabla
from pg_constraint
where contype = 'f' and confrelid = 'clientes'::regclass
  and confkey @> array[(select attnum from pg_attribute where attrelid = 'clientes'::regclass and attname = 'patente')];
-- c) Cómo está hoy (para comparar después): la restricción única vieja.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'clientes'::regclass and conname = 'clientes_patente_unique';

-- ============================================================
-- 1) CAMBIO (en una transacción: o queda todo, o nada)
-- ============================================================
begin;
alter table clientes alter column patente drop not null;
-- La unicidad pasa de restricción a índice parcial (mismo nombre, mismo
-- efecto para toda fila con patente).
alter table clientes drop constraint if exists clientes_patente_unique;
-- Por si existiera como índice suelto (no parcial) en vez de restricción.
drop index if exists clientes_patente_unique;
create unique index if not exists clientes_patente_unique on clientes (patente) where patente is not null;
alter table clientes drop constraint if exists clientes_patente_no_vacia;
alter table clientes add constraint clientes_patente_no_vacia check (patente is null or patente <> '');
commit;

-- Verificación posterior: debe listar el índice parcial y el check.
select indexname, indexdef from pg_indexes where tablename = 'clientes' and indexname = 'clientes_patente_unique';
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'clientes'::regclass and conname = 'clientes_patente_no_vacia';

-- ============================================================
-- 2) DESHACER (solo si hay que volver atrás). Falla si ya existen clientes
--    sin patente: primero hay que darles patente o borrarlos, por ejemplo
--      select id, nombre, telefono, email from clientes where patente is null;
-- ============================================================
-- begin;
-- alter table clientes drop constraint if exists clientes_patente_no_vacia;
-- drop index if exists clientes_patente_unique;
-- alter table clientes alter column patente set not null;
-- alter table clientes add constraint clientes_patente_unique unique (patente);
-- commit;
