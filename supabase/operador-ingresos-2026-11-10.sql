-- Operador en turno (10-nov-2026).
-- Una sola fila: qué operador registra ingresos ahora. Gerencia o
-- Administración lo eligen desde "Operador en turno" en el inicio; el resto de
-- los operadores no puede registrar pasadas por el túnel.
-- Sin fila o perfil_id null = todos registran (como hasta hoy).
-- No toca ninguna tabla existente. Seguro de re-pegar.

create table if not exists operador_ingresos (
  id boolean primary key default true,
  perfil_id text references perfiles(id) on delete set null,
  cambiado_por text,
  cambiado_en timestamptz not null default now()
);

alter table operador_ingresos enable row level security;
revoke all on table operador_ingresos from anon, authenticated;
