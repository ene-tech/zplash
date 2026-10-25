-- Mensajes por pasada (24-oct-2026): lo que el dueño definió en la página
-- "Mensajes por pasada". Seguro de re-pegar: los insert no pisan y los
-- update van por id. Requiere el deploy con los tipos nuevos de regla
-- (cupon_abierto, ingreso_ticket, sin_visita, cupon_por_vencer); sin ese
-- deploy las reglas nuevas quedan guardadas pero no se disparan.

-- ============ BLOQUE 1: pegar ahora ============

-- 1. Textos nuevos
insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-proxima-visita', 'SMS: descuento próxima visita', 'sms',
 'ZPlash: gracias por venir! Vuelve con el codigo {{codigoCupon}} y lava por $7.990 (o $4.990 sin aspirado). Sirve para cualquier patente, vence el {{fechaVencimientoCupon}}.', true),
('correo-proxima-visita', 'Tu próximo lavado por $7.990', 'correo',
 E'Hola {{nombre}}, ¡gracias por lavar tu auto en ZPlash!\n\nPara tu próxima visita te dejamos **{{montoOferta}} de descuento**: lavas por **$7.990**, o por **$4.990** solo túnel (sin aspirado).\n\nTu código: **{{codigoCupon}}**\n\nVale hasta el {{fechaVencimientoCupon}} y sirve para cualquier patente, así que también se lo puedes regalar a alguien. Muéstralo en el mesón al pagar.', true),
('sms-pack-confirmacion', 'SMS: confirmación de pack de lavados', 'sms',
 'ZPlash: tu pack de lavados para la patente {{patente}} quedo activo. Te quedan {{ticketsRestantes}} lavados, validos hasta el {{fechaVencimientoTickets}}. Solo di tu patente en el meson.', true),
('correo-pack-confirmacion', 'Tus lavados para la patente {{patente}}', 'correo',
 E'Hola {{nombre}}, ¡gracias por tu compra!\n\nPagaste **{{monto}}** y tu pack de lavados para la patente **{{patente}}** ya está activo.\n\nTe quedan **{{ticketsRestantes}} lavados**, válidos hasta el **{{fechaVencimientoTickets}}**.\n\nNo necesitas código: al llegar al túnel solo di tu patente.', true),
('correo-pack-ticket-usado', 'Tu lavado de hoy en ZPlash', 'correo',
 E'Hola {{nombre}}, gracias por pasar hoy por ZPlash con la patente **{{patente}}**.\n\n{{resumenTickets}}\n\nTe esperamos.', true),
('correo-plan-lavados-restantes', 'Te quedan {{lavadosRestantes}} lavados en tu plan', 'correo',
 E'Hola {{nombre}}, gracias por pasar hoy por ZPlash.\n\nEn este ciclo de tu plan te quedan **{{lavadosRestantes}} lavados**.\n\nSi te faltan, siempre puedes agregar lavados extra por **{{precioLavadoAdicional}}** cada uno, directo en el mesón.', true),
('correo-renovacion-automatica', 'Renovamos tu plan ZPlash', 'correo',
 E'Hola {{nombre}}, cobramos **{{monto}}** de tu {{plan}} para la patente **{{patente}}**.\n\nTu plan queda vigente hasta el **{{fechaVencimiento}}**.\n\n¡Nos vemos en el túnel!', true),
('sms-sin-visita', 'SMS: descuento por días sin venir', 'sms',
 'ZPlash: te echamos de menos! Tienes {{montoOferta}} de descuento en tu proximo lavado con la patente {{patente}}, hasta el {{fechaVencimientoOferta}}. Solo di tu patente en el meson.', true),
('correo-sin-visita', 'Tienes {{montoOferta}} de descuento en tu próximo lavado', 'correo',
 E'Hola {{nombre}}, hace un tiempo que no te vemos por ZPlash.\n\nTe dejamos **{{montoOferta}} de descuento** en tu próximo lavado con la patente **{{patente}}**.\n\nVale hasta el **{{fechaVencimientoOferta}}**. No necesitas código: solo di tu patente en el mesón.', true),
('sms-cupon-sin-visita-por-vencer', 'SMS: descuento por días sin venir por vencer', 'sms',
 'ZPlash: tu descuento para la patente {{patente}} vence el {{fechaVencimientoCupon}}. Aprovechalo, solo di tu patente en el meson.', true),
('correo-cupon-sin-visita-por-vencer', 'Tu descuento vence el {{fechaVencimientoCupon}}', 'correo',
 E'Hola {{nombre}}, te recordamos que tu descuento para la patente **{{patente}}** vence el **{{fechaVencimientoCupon}}**.\n\nAprovéchalo en tu próximo lavado: solo di tu patente en el mesón.', true)
on conflict (id) do nothing;

-- 2. Reglas nuevas que quedan prendidas
insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-proxima-visita', 'Lavado único: descuento próxima visita a la hora (SMS)', true, 'venta_creada', 'Lavado único', false,
  null, 0, 60, 'cupon_abierto', false, 2000, 8, 'sms-proxima-visita', 'sms', 'claude-24-oct'),
('correo-proxima-visita', 'Lavado único: descuento próxima visita a la hora (correo)', true, 'venta_creada', 'Lavado único', false,
  null, 0, 60, 'cupon_abierto', false, 2000, 8, 'correo-proxima-visita', 'correo', 'claude-24-oct'),
('sms-pack-confirmacion', 'Pack de lavados: confirmación (SMS)', true, 'venta_creada',
  'Upgrade a Promo 4 Lavados|Promo 4 Lavados|Promo 2 Lavados|Promo 4 Lavados (Web)|Promo 2 Lavados (Web)|Upgrade a Promo 2 Lavados (Descuento)|Upgrade a Promo 4 Lavados (Web)', false,
  null, 0, 1, 'mensaje_simple', false, null, null, 'sms-pack-confirmacion', 'sms', 'claude-24-oct'),
('correo-pack-confirmacion', 'Pack de lavados: confirmación (correo)', true, 'venta_creada',
  'Upgrade a Promo 4 Lavados|Promo 4 Lavados|Promo 2 Lavados|Promo 4 Lavados (Web)|Promo 2 Lavados (Web)|Upgrade a Promo 2 Lavados (Descuento)|Upgrade a Promo 4 Lavados (Web)', false,
  null, 0, 1, 'mensaje_simple', false, null, null, 'correo-pack-confirmacion', 'correo', 'claude-24-oct'),
('correo-pack-ticket-usado', 'Pack de lavados: lavados que le quedan (correo)', true, 'ingreso_ticket', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-pack-ticket-usado', 'correo', 'claude-24-oct'),
('correo-plan-lavados-restantes', 'Plan: lavados que le quedan en cada pasada (correo)', true, 'ingreso_plan_registrado', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-plan-lavados-restantes', 'correo', 'claude-24-oct'),
('correo-renovacion-automatica', 'Renovación automática exitosa (Oneclick) (correo)', true, 'venta_creada', 'Renovación automática (Oneclick)', false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-renovacion-automatica', 'correo', 'claude-24-oct')
on conflict (id) do nothing;

-- 3. Reglas nuevas que quedan APAGADAS hasta el 4-nov (bloque 2)
insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_dias_antes_vencimiento, delay_dias, accion,
  cupon_es_porcentaje, cupon_valor, cupon_validez_dias, plantilla_whatsapp_id, canal, creado_por) values
('sms-sin-visita-18', 'Sin venir 18 días: $3.000 (SMS)', false, 'sin_visita', 18, 0, 'cupon_descuento', false, 3000, 10, 'sms-sin-visita', 'sms', 'claude-24-oct'),
('correo-sin-visita-18', 'Sin venir 18 días: $3.000 (correo)', false, 'sin_visita', 18, 0, 'cupon_descuento', false, 3000, 10, 'correo-sin-visita', 'correo', 'claude-24-oct'),
('sms-sin-visita-30', 'Sin venir 30 días: $3.000 (SMS)', false, 'sin_visita', 30, 0, 'cupon_descuento', false, 3000, 10, 'sms-sin-visita', 'sms', 'claude-24-oct'),
('correo-sin-visita-30', 'Sin venir 30 días: $3.000 (correo)', false, 'sin_visita', 30, 0, 'cupon_descuento', false, 3000, 10, 'correo-sin-visita', 'correo', 'claude-24-oct'),
('sms-sin-visita-45', 'Sin venir 45 días: $3.000 (SMS)', false, 'sin_visita', 45, 0, 'cupon_descuento', false, 3000, 10, 'sms-sin-visita', 'sms', 'claude-24-oct'),
('correo-sin-visita-45', 'Sin venir 45 días: $3.000 (correo)', false, 'sin_visita', 45, 0, 'cupon_descuento', false, 3000, 10, 'correo-sin-visita', 'correo', 'claude-24-oct'),
('sms-sin-visita-65', 'Sin venir 65 días: $3.000 (SMS)', false, 'sin_visita', 65, 0, 'cupon_descuento', false, 3000, 10, 'sms-sin-visita', 'sms', 'claude-24-oct'),
('correo-sin-visita-65', 'Sin venir 65 días: $3.000 (correo)', false, 'sin_visita', 65, 0, 'cupon_descuento', false, 3000, 10, 'correo-sin-visita', 'correo', 'claude-24-oct'),
('sms-cupon-sin-visita-por-vencer', 'Descuento sin venir: vence en 3 días (SMS)', false, 'cupon_por_vencer', 3, 0, 'mensaje_simple', false, null, null, 'sms-cupon-sin-visita-por-vencer', 'sms', 'claude-24-oct'),
('correo-cupon-sin-visita-por-vencer', 'Descuento sin venir: vence en 3 días (correo)', false, 'cupon_por_vencer', 3, 0, 'mensaje_simple', false, null, null, 'correo-cupon-sin-visita-por-vencer', 'correo', 'claude-24-oct')
on conflict (id) do nothing;

-- 4. Se apagan (no se borran: el historial de envíos queda)
update reglas_whatsapp set activa = false where id in (
  'sms-regalo-otro-auto', 'sms-regalo-otro-auto-web', 'correo-regalo-otro-auto', 'correo-regalo-otro-auto-web', -- código de referido del lavado
  'sms-regla-referidos-plan-mes', 'correo-regala-y-gana-mes',                                                 -- referido en la 1ª pasada del mes del plan
  'sms-c1785028297474808'                                                                                     -- SMS plan por vencer
);
update reglas_correo set activa = false where id = 'c1787020032962393'; -- correo plan por vencer (4 días)

-- ============ BLOQUE 2: pegar el 4-nov (terminadas las campañas Vuelve $6.990 y Lluvia) ============
-- update reglas_whatsapp set activa = true where tipo_evento in ('sin_visita', 'cupon_por_vencer') and creado_por = 'claude-24-oct';
