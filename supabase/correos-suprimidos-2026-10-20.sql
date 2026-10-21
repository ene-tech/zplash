-- Lista de supresión del correo automático (oct-2026, preparación de la
-- migración a Amazon SES). Direcciones a las que el sistema NO vuelve a
-- mandar correo automático: rebotes permanentes y quejas de spam que llegan
-- solas desde SES (webhook /api/correo/ses/notificaciones), más las que se
-- carguen a mano ('manual').
--
-- Seguro de re-pegar (if not exists / enable rls es idempotente). Puede ir
-- antes o después del deploy: si la tabla no existe, el código manda igual y
-- lo anota en el log.
--
-- RLS habilitada y SIN policies: igual que el resto de las tablas (ver
-- rls-tablas-faltantes-2026-08-11.sql), la app lee y escribe por
-- DATABASE_URL, que se salta RLS; la anon key pública no ve nada.

create table if not exists correos_suprimidos (
  email text primary key,
  motivo text not null check (motivo in ('rebote', 'queja', 'manual')),
  detalle text,
  creado_en timestamptz not null default now()
);

alter table correos_suprimidos enable row level security;
revoke all on table correos_suprimidos from anon, authenticated;

-- Verificación: debe devolver una fila con rls = true, policies = 0,
-- anon_puede_leer = false.
select
  c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.tablename = 'correos_suprimidos') as policies,
  has_table_privilege('anon', 'public.correos_suprimidos', 'select') as anon_puede_leer
from pg_class c
where c.relname = 'correos_suprimidos' and c.relnamespace = 'public'::regnamespace;
