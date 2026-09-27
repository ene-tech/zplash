-- One-off fin de sep-2026. Se pega a mano en Supabase (SQL Editor), en orden.
--
-- 1) Anula el cupón de prueba "PRUEBA" ($4.000, web) que quedó asignado a
--    SBVJ21. No se borra: se caduca ahora, así queda el rastro.
-- 2) $2.000 de descuento, canal 'ambos' (web y mesón), hasta el 30-sep 23:59
--    Chile, a los clientes cuyo ÚLTIMO plan se pagó en el MESÓN y llevan 4 a
--    30 días vencidos. Con eso vuelven a 19.990 (lista 21.990). El mesón lo
--    aplica solo al buscar la patente (cuponDescuentoDePatente "local") y
--    /pagar también (buscarCuponDescuentoPlan) — no hay que tocar código.
--
-- Grupo de control: las patentes que terminan en 0 o 1 NO reciben cupón ni
-- mensaje, para comparar el 1-oct contra las que sí. Si no quieres control,
-- borra la línea marcada "CONTROL".
--
-- Mismo criterio de canal que scripts/lista-vencidos-meson.sql (creado_por de
-- la última venta de plan). Idempotente por el NOT EXISTS: re-correrlo no
-- duplica. codigo: ver el comentario largo de tmp-descuento-vencidos.sql.

-- ───────── 1) ANULAR PRUEBA ─────────
-- Preview (debe salir 1 fila):
-- SELECT codigo, nombre_lote, valor, canal, fecha_caducidad FROM cupones
-- WHERE patente_asignada = 'SBVJ21' AND tipo = 'descuento' AND usado = false AND fecha_caducidad > now();

UPDATE cupones SET fecha_caducidad = now()
WHERE patente_asignada = 'SBVJ21' AND tipo = 'descuento' AND usado = false
  AND fecha_caducidad > now() AND canal = 'web' AND valor = 4000;

-- ───────── 2) CUPÓN $2.000 VENCIDOS DE MESÓN ─────────
-- Al 27-sep le cae a 198 patentes (control fuera). Para contarlas de nuevo:
-- copiar el WITH de abajo y terminarlo en `SELECT count(*) FROM seg;`.

BEGIN;

WITH t(tipo) AS (SELECT unnest(array['Plan nuevo','Renovación preferencial','Renovación atrasada','Reactivación promocional','Renovación Web (manual)','Plan nuevo (Web)','Renovación (Web)','Renovación anticipada (Web)','Reactivación promocional (Web)','Upgrade a Plan X5 (Web)','Renovación automática (Oneclick)','Renovación anticipada (Oneclick)','Reactivación promocional (Oneclick)','Upgrade a Plan X5 (Oneclick)','Renovación manual'])),
ult AS (
  SELECT DISTINCT ON (cliente_id) cliente_id, creado_por FROM ventas
  WHERE tipo IN (SELECT tipo FROM t) AND NOT coalesce(es_servicio_adicional, false)
  ORDER BY cliente_id, fecha DESC
),
seg AS (
  SELECT cl.patente
  FROM clientes cl JOIN ult u ON u.cliente_id = cl.id
  WHERE cl.vencimiento IS NOT NULL
    AND NOT (u.creado_por LIKE 'Automático%' OR u.creado_por LIKE '%(Oneclick)%' OR u.creado_por = 'Migración histórica WooCommerce')
    AND (now() AT TIME ZONE 'America/Santiago')::date - (cl.vencimiento AT TIME ZONE 'America/Santiago')::date BETWEEN 4 AND 30
    AND right(cl.patente, 1) NOT IN ('0', '1') -- CONTROL
    AND NOT EXISTS (
      SELECT 1 FROM cupones c
      WHERE c.patente_asignada = cl.patente AND c.tipo = 'descuento' AND c.usado = false AND c.fecha_caducidad > now()
    )
)
INSERT INTO cupones (
  id, codigo, nombre_lote, valor, numero_lote, total_lote, fecha_caducidad,
  usado, creado_en, creado_por, tipo, es_porcentaje, patente_asignada, canal
)
SELECT
  'c' || (extract(epoch FROM now()) * 1000)::bigint::text || row_number() OVER (ORDER BY seg.patente),
  cod.codigo,
  'Vuelve a 19.990 - vencidos mesón sep 2026',
  2000, 1, 1,
  timestamp '2026-09-30 23:59:59' AT TIME ZONE 'America/Santiago',
  false, now(), 'Administrador', 'descuento', false,
  seg.patente,
  'ambos'
FROM seg
CROSS JOIN LATERAL (
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(u.b, i) % 32) + 1, 1), '' ORDER BY i) AS codigo
  FROM (SELECT decode(md5(gen_random_uuid()::text || seg.patente), 'hex') AS b) u,
       generate_series(0, 5) AS i
) cod;

COMMIT;
