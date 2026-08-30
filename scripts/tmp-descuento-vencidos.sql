-- One-off: $4.000 de descuento a todo cliente con plan VENCIDO, vigente hasta
-- el 10-sep-2026 y SOLO POR WEB (canal='web'): el correo lo ofrece por
-- suscribirse en la pagina, no para aplicarlo en el meson. Se aplica a mano en
-- Supabase (SQL Editor).
--
-- No hace falta tocar código: un cupón tipo "descuento" con patente_asignada
-- ya lo levanta buscarCuponDescuentoPlan (@/lib/pagos/cuponPlan) y Mi Cuenta
-- lo pinta en la VehiculoCard con el precio ya rebajado — mismo número que
-- después cobra Webpay/Oneclick y el mesón.
--
-- Idempotente: el NOT EXISTS salta a quien ya tiene un descuento vivo, así que
-- re-correrlo no duplica (y además evita que este cupón tape a uno que vence
-- antes, ver cuponDescuentoDePatente).
--
-- codigo: 6 chars del mismo alfabeto sin 0/O ni 1/I de generarCodigoCupon,
-- desde md5(gen_random_uuid() || patente). El `|| cl.patente` NO es decorativo:
-- sin él el LATERAL no referencia la fila externa, Postgres lo evalua UNA sola
-- vez y las 462 filas salen con el mismo codigo (visto: 23505 en el primer
-- intento). Correlacionado, ademas, dos patentes nunca colisionan entre si.
-- Contra los codigos ya emitidos la red es el UNIQUE de `codigo`: si choca, el
-- INSERT falla entero y basta con volver a correrlo (el NOT EXISTS de abajo lo
-- hace idempotente).

-- PREVIEW (correr esto SOLO primero, para ver a quiénes les va a caer):
-- SELECT cl.origen, count(*)
-- FROM clientes cl
-- WHERE cl.plan IS NOT NULL AND btrim(cl.plan) <> '' AND cl.vencimiento IS NOT NULL
--   AND (cl.vencimiento AT TIME ZONE 'America/Santiago')::date < (now() AT TIME ZONE 'America/Santiago')::date
--   AND NOT EXISTS (SELECT 1 FROM cupones c WHERE c.patente_asignada = cl.patente
--                     AND c.tipo = 'descuento' AND c.usado = false AND c.fecha_caducidad > now())
-- GROUP BY ROLLUP (cl.origen);

BEGIN;

INSERT INTO cupones (
  id, codigo, nombre_lote, valor, numero_lote, total_lote, fecha_caducidad,
  usado, creado_en, creado_por, tipo, es_porcentaje, patente_asignada, canal
)
SELECT
  'c' || (extract(epoch FROM now()) * 1000)::bigint::text || row_number() OVER (ORDER BY cl.patente),
  cod.codigo,
  'Descuento plan vencido - ago 2026',
  4000,
  1,
  1,
  -- `at time zone` y no un offset a mano: Chile ya esta en horario de verano
  -- el 10-sep, y el '-04' que puse primero lo corria a las 00:59 del 11.
  timestamp '2026-09-10 23:59:59' AT TIME ZONE 'America/Santiago',
  false,
  now(),
  'Administrador',
  'descuento',
  false,
  cl.patente,
  'web'
FROM clientes cl
CROSS JOIN LATERAL (
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(u.b, i) % 32) + 1, 1), '' ORDER BY i) AS codigo
  FROM (SELECT decode(md5(gen_random_uuid()::text || cl.patente), 'hex') AS b) u,
       generate_series(0, 5) AS i
) cod
WHERE cl.plan IS NOT NULL
  AND btrim(cl.plan) <> ''
  AND cl.vencimiento IS NOT NULL
  -- Mismo criterio día-granular en hora de Chile que planStatus/sigueVigenteHoy.
  AND (cl.vencimiento AT TIME ZONE 'America/Santiago')::date < (now() AT TIME ZONE 'America/Santiago')::date
  AND NOT EXISTS (
    SELECT 1 FROM cupones c
    WHERE c.patente_asignada = cl.patente
      AND c.tipo = 'descuento'
      AND c.usado = false
      AND c.fecha_caducidad > now()
  );

COMMIT;
