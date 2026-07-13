-- Corre esto una sola vez en el SQL Editor de Supabase: elimina las tablas
-- que quedaron huérfanas tras migrar a `perfiles` (ver migrar-perfiles.sql).
-- Verificado que nada en el código (src/) referencia "operadores",
-- "administradores" ni la vista "administradores_publicos" — las rutas
-- /api/admin/* ya no existen, todo el login pasa por /api/perfiles/*.
--
-- Antes de correr, si quieres quedarte con un respaldo de los datos:
--   select * from administradores;
--   select * from operadores;

drop view if exists administradores_publicos;
drop table if exists operadores;
drop table if exists administradores;
