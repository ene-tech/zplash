-- Documentos adjuntos en la ficha del cliente (comprobantes de devolución u
-- otros). Ver src/db/schema/clienteAdjuntos.ts.
--
-- Qué hace: crea la tabla donde se anota cada archivo adjunto (a qué cliente,
-- qué es, quién lo subió y cuándo) y el bucket PRIVADO donde se guardan los
-- archivos (máx. 10 MB c/u). Sin políticas para anon: solo el servidor lee
-- y escribe; el navegador sube con una URL firmada que entrega el servidor
-- tras revisar la sesión, y ve los archivos con URLs firmadas de 5 minutos.
--
-- Qué NO toca: ninguna tabla, bucket ni dato existente.
-- Va ANTES del deploy. Idempotente: se puede volver a correr.

create table if not exists cliente_adjuntos (
  id text primary key,
  cliente_id text not null references clientes(id) on delete cascade,
  tipo text not null,
  detalle text,
  nombre_archivo text not null,
  tipo_mime text,
  tamano integer,
  ruta text not null,
  subido_en timestamptz not null default now(),
  subido_por text
);

create index if not exists cliente_adjuntos_cliente_idx on cliente_adjuntos (cliente_id);

alter table cliente_adjuntos enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adjuntos-clientes', 'adjuntos-clientes', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
