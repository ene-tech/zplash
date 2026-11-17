-- Radio de la zona alrededor del local que vigila la app nativa
-- (descuento al pasar cerca, regla "cerca_local"). Va ANTES del deploy:
-- getConfig selecciona todas las columnas de config.
alter table config add column if not exists geocerca_radio_metros integer not null default 400;
