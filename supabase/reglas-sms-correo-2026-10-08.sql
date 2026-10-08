-- Reglas automáticas por SMS y correo en reemplazo de las de WhatsApp
-- (apagadas el 7-oct-2026). Pegar DESPUÉS del deploy que agrega
-- reglas_whatsapp.canal: el código viejo ignora el canal y las trataría como
-- WhatsApp. Re-pegable: on conflict do nothing.
--
-- Las de SMS quedan APAGADAS (activa=false): se prenden desde Reglas
-- WhatsApp cuando LabsMobile tenga saldo. Un SMS que falla por saldo deja el
-- disparo en error y no se reintenta.

insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
  ('sms-cobro-fallido', 'SMS: no se pudo cobrar el plan', 'sms',
   'ZPlash: no pudimos cobrar tu {{plan}}. Revisa tu tarjeta en zplash.cl/cliente para no perder tu plan.', true),
  ('sms-vencimiento-proximo', 'SMS: plan por vencer', 'sms',
   'ZPlash: tu plan de la patente {{patente}} vence el {{fechaVencimiento}}. Renuévalo en zplash.cl/cliente y sigue lavando.', true),
  ('sms-cobro-exitoso', 'SMS: renovación automática cobrada', 'sms',
   'ZPlash: cobramos {{monto}} de tu {{plan}}. Vigente hasta el {{fechaVencimiento}}. Nos vemos!', true),
  ('sms-compra-plan', 'SMS: plan contratado', 'sms',
   'ZPlash: confirmamos tu {{plan}} para la patente {{patente}}, vigente hasta el {{fechaVencimiento}}.', true),
  ('sms-renovacion', 'SMS: plan renovado', 'sms',
   'ZPlash: renovamos tu plan de la patente {{patente}}, vigente hasta el {{fechaVencimiento}}.', true),
  ('sms-reactivacion', 'SMS: plan reactivado', 'sms',
   'ZPlash: reactivamos tu plan de la patente {{patente}}, vigente hasta el {{fechaVencimiento}}.', true),
  ('sms-regala-y-gana', 'SMS: regala y gana', 'sms',
   'ZPlash: comparte zplash.cl/?ref={{patente}} con un amigo: él recibe {{descuentoReferido}} de descuento y tú ganas {{descuentoReferido}}.', true),
  ('correo-regala-y-gana', 'Regala {{descuentoReferido}} y gana {{descuentoReferido}} en ZPlash', 'correo',
   E'Hola {{nombre}}, ¡gracias por lavar tu auto en ZPlash!\n\nRegala **{{descuentoReferido}}** y gana **{{descuentoReferido}}**: comparte este link con un amigo. Él recibe el descuento en su primer lavado y, cuando lo use, te dejamos el tuyo para tu próximo pago.\n\nhttps://zplash.cl/?ref={{patente}}\n\n¡Nos vemos en el túnel!', true)
on conflict (id) do nothing;

-- Un SMS por cada regla de WhatsApp apagada, con sus mismas condiciones.
insert into reglas_whatsapp (
  id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_planes, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, condicion_pasadas_min, delay_dias, accion, cupon_es_porcentaje,
  cupon_valor, cupon_validez_dias, plantilla_whatsapp_id, canal, creado_por
)
select
  'sms-' || r.id, r.nombre || ' (SMS)', false, r.tipo_evento, r.condicion_tipo_venta, r.condicion_planes,
  r.condicion_excluir_con_cupon, r.condicion_dias_antes_vencimiento, r.condicion_pasadas_min, r.delay_dias,
  r.accion, r.cupon_es_porcentaje, r.cupon_valor, r.cupon_validez_dias,
  case r.plantilla_whatsapp_id
    when 'wa-cobro-automatico-fallido' then 'sms-cobro-fallido'
    when 'wa-vencimiento-proximo' then 'sms-vencimiento-proximo'
    when 'wa-cobro-automatico-exitoso' then 'sms-cobro-exitoso'
    when 'wa-compra-confirmada' then 'sms-compra-plan'
    when 'wa-renovacion-confirmada' then 'sms-renovacion'
    when 'wa-reactivacion-plan-vencido' then 'sms-reactivacion'
    when 'wa-lavado-unico-referidos' then 'sms-regala-y-gana'
  end,
  'sms', 'reemplazo-whatsapp-oct-2026'
from reglas_whatsapp r
where r.canal = 'whatsapp' and r.id not like 'sms-%'
  and r.plantilla_whatsapp_id in ('wa-cobro-automatico-fallido', 'wa-vencimiento-proximo', 'wa-cobro-automatico-exitoso',
    'wa-compra-confirmada', 'wa-renovacion-confirmada', 'wa-reactivacion-plan-vencido', 'wa-lavado-unico-referidos')
on conflict (id) do nothing;

-- Regala y Gana por correo: no tenía correo (solo iba por WhatsApp). Activas.
insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, delay_dias, accion, plantilla_whatsapp_id, canal, creado_por) values
  ('correo-regala-y-gana-mes', 'Plan: invitación Regala y Gana (1ra visita del mes) (correo)', true, 'primer_ingreso_mes', null, 0, 'mensaje_simple', 'correo-regala-y-gana', 'correo', 'reemplazo-whatsapp-oct-2026'),
  ('correo-regala-y-gana-lavado', 'Lavado único: invitación Regala y Gana (correo)', true, 'venta_creada', 'Lavado único', 0, 'mensaje_simple', 'correo-regala-y-gana', 'correo', 'reemplazo-whatsapp-oct-2026')
on conflict (id) do nothing;
