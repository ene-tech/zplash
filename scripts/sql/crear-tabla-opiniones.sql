-- Tabla de opiniones del bot de WhatsApp (Opción 6 / QR del túnel).
-- Se pega tal cual en Supabase → SQL Editor → New query → Run.
--
-- Qué hace: crea la tabla `opiniones` y su índice. Nada más.
-- Qué NO toca: ninguna tabla existente. No borra ni modifica datos.
-- Qué responde: "Success. No rows returned".
-- Se puede correr dos veces sin romper nada (IF NOT EXISTS).

create table if not exists public.opiniones (
  id          text primary key,
  cliente_id  text references public.clientes(id) on delete set null,
  telefono    text not null,
  nota        integer not null check (nota between 1 and 7),
  comentario  text,
  creado_en   timestamptz not null default now()
);

-- El listado siempre se mira por fecha descendente ("las opiniones de esta
-- semana"), y el cruce por cliente es para la ficha.
create index if not exists opiniones_creado_en_idx on public.opiniones (creado_en desc);
create index if not exists opiniones_cliente_id_idx on public.opiniones (cliente_id);
