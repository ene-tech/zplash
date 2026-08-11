-- Fusiona los 3 SKUs de tamaño de "Lavado Completo Detailing"
-- (detailing-pequeno/detailing-mediano/detailing-xl) en uno solo con precio
-- por tamaño S/M/L/XL en precios_tamano (ver migración 0055).
--
-- "detailing-mediano" se conserva y se renombra: mantener el mismo id evita
-- romper cita_servicios (FK con onDelete cascade), que puede tener filas
-- históricas apuntando a él.
UPDATE servicios SET nombre = 'Lavado Completo Detailing' WHERE id = 'detailing-mediano';

-- "detailing-pequeno" y "detailing-xl" se desactivan en vez de borrarse:
-- cita_servicios.servicio_id tiene FK con onDelete cascade a servicios.id, y
-- el criterio de este proyecto es no borrar servicios del catálogo para no
-- perder el vínculo histórico de citas ya agendadas (ver comentario en
-- db/schema/agenda.ts). Quedan fuera del catálogo público porque
-- getPreciosPublicos() solo trae servicios con activo = true.
UPDATE servicios SET activo = false WHERE id IN ('detailing-pequeno', 'detailing-xl');

-- Precios S/M/L/XL de partida a partir de los 3 precios flat que ya
-- existían en producción (Auto Pequeño $24.990 / Mediano-SUV-Pickup $29.990
-- / Auto XL $34.990): S y M heredan pequeño/mediano tal cual, L hereda el
-- valor que tenía XL, y XL sube al siguiente escalón de $5.000 ya que ahora
-- es un tamaño nuevo por sobre el antiguo tope. El administrador puede
-- ajustar estos 4 valores después desde Web Settings → Servicios.
INSERT INTO precios_tamano (servicio_id, s, m, l, xl)
VALUES ('detailing-mediano', 24990, 29990, 34990, 39990)
ON CONFLICT (servicio_id) DO UPDATE SET s = excluded.s, m = excluded.m, l = excluded.l, xl = excluded.xl;
