-- Corre esto una sola vez en el SQL Editor de Supabase: agrega el log de
-- auditoría. Registra quién modificó qué fila y cuándo para las tablas que
-- mueven dinero o datos de clientes (clientes, ingresos, ventas, empresas,
-- cupones, movimientos_contables).
--
-- Se escribe a nivel de aplicación (ver commit() en AppContext.tsx), no con
-- triggers: esta app no usa Supabase Auth/RLS, toda la escritura pasa por
-- una sola conexión server-side (DATABASE_URL) que no sabe qué perfil está
-- logueado a nivel de DB. Por eso NO captura ediciones manuales hechas
-- directo en el SQL Editor de Supabase — solo lo que pasa por la app.
create table if not exists auditoria (
  id bigserial primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('insert', 'update', 'delete')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists auditoria_tabla_registro_idx on auditoria (tabla, registro_id);
create index if not exists auditoria_creado_en_idx on auditoria (creado_en desc);

alter table auditoria enable row level security;
drop policy if exists "anon full access" on auditoria;
