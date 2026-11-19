-- Promo "primer mes del Plan X3 a $9.990" (19-nov-2026). Propuesta del agente
-- comercial aprobada por el dueño: A = al terminar un pack de tickets sin
-- recomprar en las 48 h del mesón; B = sin plan que vino 2+ días en 30.
-- Descuento de $5.000 atado a la patente, solo para el primer cobro del X3
-- (lote "Primer mes Plan X3", solo web), válido 7 días. Patentes terminadas
-- en 0 = grupo de control (quedan con su disparo "omitido").
--
-- Pegar DESPUÉS del deploy (el código viejo no conoce estos eventos ni
-- {{linkPlanX3}}). Seguro de re-pegar: los insert no pisan.
-- Las reglas quedan APAGADAS: se encienden el 26-nov con el bloque 2, cuando
-- ya terminó "Vuelve nov" (24-nov) y el regalo X5 (25-nov).

-- ============ BLOQUE 1: textos y reglas (apagadas) ============
insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-x3-fin-pack', 'SMS: terminó su pack, primer mes Plan X3 a $9.990', 'sms',
 'ZPlash: se termino tu pack de lavados. Sigue con el Plan X3: 3 lavados Full Tunel al mes. Tu primer mes $9.990 y luego $14.990 con cargo mensual automatico. Valido hasta el {{fechaVencimientoOferta}} (incluido): {{linkPlanX3}}', true),
('correo-x3-fin-pack', 'Tu primer mes del Plan X3 a $9.990', 'correo',
 E'Hola {{nombre}},\n\nSe terminó tu pack de lavados para la patente {{patente}}.\n\nPara que sigas lavando sin andar comprando tickets, te dejamos el **Plan X3**: 3 lavados Full Túnel al mes para tu auto.\n\n**Tu primer mes a $9.990** (en vez de $14.990). Desde el segundo mes, $14.990 con cargo mensual automático a tu tarjeta.\n\nEl descuento ya está cargado a tu patente y es válido hasta el {{fechaVencimientoOferta}} (incluido). Contrátalo aquí, tu patente ya viene puesta:\n{{linkPlanX3}}', true),
('sms-x3-habitual', 'SMS: viene seguido, primer mes Plan X3 a $9.990', 'sms',
 'ZPlash: ya vienes seguido! Con el Plan X3 tienes 3 lavados Full Tunel al mes. Tu primer mes $9.990 y luego $14.990 con cargo mensual automatico. Valido hasta el {{fechaVencimientoOferta}} (incluido): {{linkPlanX3}}', true),
('correo-x3-habitual', 'Ya vienes seguido: tu primer mes del Plan X3 a $9.990', 'correo',
 E'Hola {{nombre}},\n\nVimos que ya vienes seguido a lavar la patente {{patente}}. Con el **Plan X3** te sale más a cuenta: 3 lavados Full Túnel al mes.\n\n**Tu primer mes a $9.990** (en vez de $14.990). Desde el segundo mes, $14.990 con cargo mensual automático a tu tarjeta.\n\nEl descuento ya está cargado a tu patente y es válido hasta el {{fechaVencimientoOferta}} (incluido). Contrátalo aquí, tu patente ya viene puesta:\n{{linkPlanX3}}', true)
on conflict (id) do nothing;

insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-x3-fin-pack', 'Fin de pack: primer mes Plan X3 a $9.990 (SMS)', false, 'fin_pack_x3', null, false,
  null, 0, null, 'cupon_descuento', false, 5000, 7, 'sms-x3-fin-pack', 'sms', 'claude-19-nov'),
('correo-x3-fin-pack', 'Fin de pack: primer mes Plan X3 a $9.990 (correo)', false, 'fin_pack_x3', null, false,
  null, 0, null, 'cupon_descuento', false, 5000, 7, 'correo-x3-fin-pack', 'correo', 'claude-19-nov'),
('sms-x3-habitual', 'Habitual sin plan: primer mes Plan X3 a $9.990 (SMS)', false, 'habitual_sin_plan', null, false,
  null, 0, null, 'cupon_descuento', false, 5000, 7, 'sms-x3-habitual', 'sms', 'claude-19-nov'),
('correo-x3-habitual', 'Habitual sin plan: primer mes Plan X3 a $9.990 (correo)', false, 'habitual_sin_plan', null, false,
  null, 0, null, 'cupon_descuento', false, 5000, 7, 'correo-x3-habitual', 'correo', 'claude-19-nov')
on conflict (id) do nothing;

-- Comprobar: 4 plantillas y 4 reglas, todas activa = false.
select id, activa, tipo_evento, cupon_valor, cupon_validez_dias from reglas_whatsapp where creado_por = 'claude-19-nov';

-- ============ BLOQUE 2: encender (el 26-nov-2026) ============
-- update reglas_whatsapp set activa = true where creado_por = 'claude-19-nov';

-- Apagar (frena los envíos nuevos; los descuentos ya emitidos siguen vivos):
-- update reglas_whatsapp set activa = false where creado_por = 'claude-19-nov';
