-- Avisos de packs (27-oct-2026): respuestas del dueño en la página "Recorrido
-- del cliente ZPlash". Seguro de re-pegar: los insert no pisan y los update
-- van por id.

-- ============ BLOQUE 1: después del deploy de feat/avisos-packs-27oct ============
-- SMS en cada pasada con ticket: cuántos le quedan. En la pasada del último
-- ticket sale la oferta (ultimo_ticket_pack) en vez de este.

insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-pack-ticket-usado', 'SMS: lavados que le quedan del pack', 'sms',
 'ZPlash: gracias por venir! {{resumenTicketsSms}}', true)
on conflict (id) do nothing;

insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-pack-ticket-usado', 'Pack de lavados: lavados que le quedan (SMS)', true, 'ingreso_ticket', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'sms-pack-ticket-usado', 'sms', 'claude-27-oct')
on conflict (id) do nothing;

-- ============ BLOQUE 2: después del deploy de la Promo 2 Tickets 15 Días ============
-- (el mesón tiene que poder venderla antes de que el mensaje la ofrezca)

-- 1. Último ticket: ofrece las dos promos.
update plantillas_whatsapp set mensaje =
 'ZPlash: se acabaron tus lavados? Exclusivo clientes VIP: 2 lavados x $9.990 o 5 x {{precioPromoVip}} para {{patente}}. Paga en el meson hasta el {{fechaLimitePromoVip}}.'
where id = 'sms-ultimo-ticket-vip';

update plantillas_whatsapp set nombre = '¿Se te acabaron los lavados? Promo exclusiva VIP', mensaje =
 E'Hola {{nombre}}, hoy usaste el último lavado de tu pack para la patente **{{patente}}**.\n\n¿Se te acabaron los lavados? Como cliente VIP tienes dos promos exclusivas:\n\n**2 lavados por $9.990** para tu auto, válidos 15 días.\n\n**Promo 5 Tickets VIP por {{precioPromoVip}}**: 4 lavados para tu auto y 1 libre para el auto que quieras, válidos 30 días.\n\nSe pagan solo en el mesón y valen **hasta el {{fechaLimitePromoVip}}**.'
where id = 'correo-ultimo-ticket-vip';

update reglas_whatsapp set nombre = 'Último ticket de pack: 2 x $9.990 o VIP (SMS)' where id = 'sms-ultimo-ticket-vip';
update reglas_whatsapp set nombre = 'Último ticket de pack: 2 x $9.990 o VIP (correo)' where id = 'correo-ultimo-ticket-vip';

-- 2. Tickets vencidos sin usar: las mismas dos promos.
insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-pack-vencido', 'SMS: tickets vencidos, recompra', 'sms',
 'ZPlash: se vencieron lavados de tu pack para {{patente}}. Exclusivo para ti: 2 lavados x $9.990 o 5 x {{precioPromoVip}}. Paga en el meson hasta el {{fechaLimitePromoVip}}.', true),
('correo-pack-vencido', 'Se vencieron tus lavados: te dejamos una promo exclusiva', 'correo',
 E'Hola {{nombre}}, se vencieron lavados de tu pack para la patente **{{patente}}** sin que alcanzaras a usarlos.\n\nPara que no te quedes sin lavar, tienes dos promos exclusivas:\n\n**2 lavados por $9.990** para tu auto, válidos 15 días.\n\n**Promo 5 Tickets VIP por {{precioPromoVip}}**: 4 lavados para tu auto y 1 libre para el auto que quieras, válidos 30 días.\n\nSe pagan solo en el mesón y valen **hasta el {{fechaLimitePromoVip}}**.', true)
on conflict (id) do nothing;

insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-pack-vencido', 'Tickets de pack vencidos: 2 x $9.990 o VIP (SMS)', true, 'pack_vencido', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'sms-pack-vencido', 'sms', 'claude-27-oct'),
('correo-pack-vencido', 'Tickets de pack vencidos: 2 x $9.990 o VIP (correo)', true, 'pack_vencido', null, false,
  null, 0, null, 'mensaje_simple', false, null, null, 'correo-pack-vencido', 'correo', 'claude-27-oct')
on conflict (id) do nothing;

-- 3. La compra de la Promo 2 Tickets 15 Días también recibe la confirmación del pack.
update reglas_whatsapp set condicion_tipo_venta = condicion_tipo_venta || '|Promo 2 Tickets 15 Días'
where id in ('sms-pack-confirmacion', 'correo-pack-confirmacion')
  and condicion_tipo_venta not like '%Promo 2 Tickets 15 Días%';
