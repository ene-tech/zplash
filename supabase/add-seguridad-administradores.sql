-- Cierra el acceso público directo a las contraseñas de administradores
-- (Evelyn/Juan). Hasta ahora cualquiera con la anon key (pública, va en el
-- bundle del navegador) podía leer la tabla completa vía REST, incluyendo
-- la columna "clave" en texto plano. Después de correr esto:
--   - El cliente solo puede leer administradores_publicos (sin clave).
--   - El login y el cambio de contraseña pasan por /api/admin/login y
--     /api/admin/cambiar-clave, que usan la service role key server-side.
-- Requiere que SUPABASE_SERVICE_ROLE_KEY esté configurada como variable de
-- entorno (local y en Vercel) antes de desplegar el código que la usa.

create or replace view administradores_publicos as
  select id, nombre, es_gerente from administradores;

drop policy if exists "anon full access" on administradores;
grant select on administradores_publicos to anon;

-- Fuerza a PostgREST a refrescar su caché de esquema ahora mismo, en vez de
-- esperar a que lo note solo (evita un "table not found" pasajero justo
-- después de crear la vista).
notify pgrst, 'reload schema';
