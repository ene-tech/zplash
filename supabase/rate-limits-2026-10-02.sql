-- Tabla del rate limit compartido (src/lib/rateLimit.ts). Hasta que exista,
-- la app usa el límite en memoria de antes, así que da lo mismo aplicarla
-- antes o después del deploy. UNLOGGED: son contadores de minutos, no vale la
-- pena escribirlos al WAL; si Postgres se reinicia se vacían y no pasa nada.
-- Sin RLS abierta: solo la usa el servidor con la conexión directa (DATABASE_URL).

create unlogged table if not exists rate_limits (
  clave text primary key,
  golpes integer not null,
  reinicia_en timestamptz not null
);

alter table rate_limits enable row level security;
