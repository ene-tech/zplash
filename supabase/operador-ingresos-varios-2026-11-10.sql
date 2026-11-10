-- Operador en turno: más de un operador habilitado (10-nov-2026).
-- Agrega la lista perfil_ids a operador_ingresos (antes había un solo
-- perfil_id). null = todos registran; una lista = solo esos.
-- Si ya había un operador elegido, pasa a la lista para que nada cambie.
-- perfil_id queda en la tabla pero el código ya no la lee.
-- No toca ninguna otra tabla. Seguro de re-pegar.

alter table operador_ingresos add column if not exists perfil_ids jsonb;

update operador_ingresos
set perfil_ids = jsonb_build_array(perfil_id)
where perfil_id is not null and perfil_ids is null;
