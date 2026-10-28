-- Prórroga de tickets de pack (28-oct-2026): el ticket que vence sin usar se
-- alarga 2 días (una sola vez) y a la mañana siguiente sale SMS + correo
-- "se te venció tu ticket, pero te lo extendimos 2 días". Al usarlo, si era el
-- último, sale la oferta de 2 o 5 lavados (ultimo_ticket_pack, ya existente).
-- Seguro de re-pegar.

-- ============ BLOQUE 1: ANTES del deploy ============
-- El código nuevo lee esta columna en cada consulta de cupones.
alter table cupones add column if not exists extendido_en timestamptz;

-- ============ BLOQUE 2: DESPUÉS del deploy ============
-- Las reglas prenden la prórroga: sin reglas activas no se extiende nada.
insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-pack-extendido', 'SMS: ticket vencido, extendido 2 días', 'sms',
 'ZPlash: se te vencio tu ticket de lavado de {{patente}}, pero te lo extendimos 2 dias para que no lo pierdas. Valido hasta el {{fechaVencimientoCupon}} (incluido).', true),
('correo-pack-extendido', 'Se te venció tu ticket de lavado, pero te lo extendimos 2 días', 'correo',
 E'Hola {{nombre}}, se te venció tu ticket de lavado para la patente **{{patente}}**, pero te lo extendimos **2 días** para que no lo pierdas.\n\nAhora es válido hasta el **{{fechaVencimientoCupon}} (incluido)**. Solo di tu patente en el mesón.', true)
on conflict (id) do nothing;

insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-pack-extendido', 'Ticket de pack vencido: extendido 2 días (SMS)', true, 'pack_extendido', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'sms-pack-extendido', 'sms', 'claude-28-oct'),
('correo-pack-extendido', 'Ticket de pack vencido: extendido 2 días (correo)', true, 'pack_extendido', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-pack-extendido', 'correo', 'claude-28-oct')
on conflict (id) do nothing;
