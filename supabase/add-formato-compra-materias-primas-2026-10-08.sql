-- Formato de compra de las materias primas de Fabricación (bidón de 5.000 ml,
-- caja de 100 frascos…), para registrar compras por envase.
--
-- Qué hace: agrega la columna opcional `formato_compra` a `materias_primas`.
-- Las que ya existen quedan sin formato (se compran por L/kg/un como hoy).
-- Qué NO toca: ningún dato existente.
-- Se puede pegar dos veces (if not exists). Va ANTES del deploy.

alter table materias_primas add column if not exists formato_compra numeric;
