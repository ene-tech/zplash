-- Corre esto una sola vez en el SQL Editor de Supabase: unifica el nombre de
-- "quién registró este movimiento". Hoy `ingresos` y `ventas` usan
-- "operador" mientras que clientes/empresas/cupones/movimientos_contables
-- usan "creado_por" para exactamente el mismo dato (ui.perfilActual?.nombre,
-- o textos como "Administrador" / "Automático (Web)"). Se deja un solo
-- nombre en las 6 tablas.
alter table ingresos rename column operador to creado_por;
alter table ventas rename column operador to creado_por;
