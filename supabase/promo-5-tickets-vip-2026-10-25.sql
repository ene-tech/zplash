-- Promo 5 Tickets VIP (25-oct-2026): al gastar el último ticket de un pack de
-- 4 llega la oferta por SMS y correo (evento "ultimo_ticket_pack", que en esa
-- pasada reemplaza al correo de "te quedan X lavados"), y al comprarla en el
-- mesón, la confirmación con el código del ticket libre. Seguro de re-pegar.
-- Va después del deploy: el código viejo no conoce el evento ni las variables.

insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-ultimo-ticket-vip', 'SMS: último ticket del pack, oferta VIP', 'sms',
 'ZPlash: usaste el ultimo lavado de tu pack. Solo para ti: Promo 5 Tickets VIP por {{precioPromoVip}}, 4 lavados para {{patente}} + 1 libre para cualquier auto. Pagala en el meson hasta el {{fechaLimitePromoVip}}.', true),
('correo-ultimo-ticket-vip', 'Tu Promo 5 Tickets VIP por {{precioPromoVip}}', 'correo',
 E'Hola {{nombre}}, hoy usaste el último lavado de tu pack para la patente **{{patente}}**.\n\nPor ser cliente frecuente te ofrecemos la **Promo 5 Tickets VIP**: por **{{precioPromoVip}}** te llevas **4 lavados** para tu auto y **1 lavado libre** que puedes usar en tu auto o regalarle a quien quieras.\n\nLos 5 lavados duran 30 días. La oferta se paga solo en el mesón y vale **hasta el {{fechaLimitePromoVip}}**.', true),
('sms-vip-confirmacion', 'SMS: confirmación Promo 5 Tickets VIP', 'sms',
 'ZPlash: tu Promo 5 Tickets VIP quedo activa. Te quedan {{ticketsRestantes}} lavados para {{patente}} hasta el {{fechaVencimientoTickets}}. Tu lavado libre para cualquier auto: codigo {{codigoTicketLibre}}.', true),
('correo-vip-confirmacion', 'Tu Promo 5 Tickets VIP está activa', 'correo',
 E'Hola {{nombre}}, ¡gracias por tu compra!\n\nTu **Promo 5 Tickets VIP** para la patente **{{patente}}** ya está activa: te quedan **{{ticketsRestantes}} lavados** para tu auto, válidos hasta el **{{fechaVencimientoTickets}}**. Al llegar solo di tu patente.\n\nTu **lavado libre** sirve para tu auto o para cualquier otro: muestra el código **{{codigoTicketLibre}}** en el mesón.', true)
on conflict (id) do nothing;

insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-ultimo-ticket-vip', 'Último ticket de pack de 4: oferta VIP (SMS)', true, 'ultimo_ticket_pack', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'sms-ultimo-ticket-vip', 'sms', 'claude-25-oct'),
('correo-ultimo-ticket-vip', 'Último ticket de pack de 4: oferta VIP (correo)', true, 'ultimo_ticket_pack', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-ultimo-ticket-vip', 'correo', 'claude-25-oct'),
('sms-vip-confirmacion', 'Promo 5 Tickets VIP: confirmación (SMS)', true, 'venta_creada', 'Promo 5 Tickets VIP', false,
  null, 0, 1, 'mensaje_simple', false, null, null, 'sms-vip-confirmacion', 'sms', 'claude-25-oct'),
('correo-vip-confirmacion', 'Promo 5 Tickets VIP: confirmación (correo)', true, 'venta_creada', 'Promo 5 Tickets VIP', false,
  null, 0, 1, 'mensaje_simple', false, null, null, 'correo-vip-confirmacion', 'correo', 'claude-25-oct')
on conflict (id) do nothing;
