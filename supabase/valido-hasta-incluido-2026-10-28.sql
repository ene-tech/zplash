-- "Válido hasta el X (incluido)" en toda la app (28-oct-2026).
-- Re-pegable: cada update se acota a las filas que todavía tienen el texto viejo.

-- 1) Cupones y tickets vivos: que valgan su último día completo (23:59:59 de
--    Chile), igual que los que emite el código desde este cambio.
update cupones
set fecha_caducidad = ((fecha_caducidad at time zone 'America/Santiago')::date + time '23:59:59') at time zone 'America/Santiago'
where usado = false
  and fecha_caducidad > now()
  and (fecha_caducidad at time zone 'America/Santiago')::time < '23:59:00';

-- 2) Textos de SMS y correo de las reglas (plantillas_whatsapp sin template de Meta).
update plantillas_whatsapp set mensaje = replace(mensaje, 'vence el {{fechaVencimiento}}.', 'es válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'sms-vencimiento-proximo' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'Vigente hasta el {{fechaVencimiento}}.', 'Válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'sms-cobro-exitoso' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'vigente hasta el {{fechaVencimiento}}', 'válido hasta el {{fechaVencimiento}} (incluido)')
  where id in ('sms-compra-plan', 'sms-renovacion', 'sms-reactivacion', 'sms-bienvenida-x5') and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'vigente hasta el **{{fechaVencimiento}}**', 'válido hasta el **{{fechaVencimiento}} (incluido)**')
  where id in ('correo-renovacion-automatica', 'correo-bienvenida-x5') and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'Vale hasta el {{fechaVencimientoCupon}}', 'Válido hasta el {{fechaVencimientoCupon}} (incluido)')
  where id in ('correo-regalo-otro-auto', 'correo-proxima-visita') and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, '(vence {{fechaVencimientoCupon}})', '(válido hasta el {{fechaVencimientoCupon}}, incluido)')
  where id = 'sms-regalo-otro-auto' and mensaje not like '%incluido%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'para {{patente}} hasta el {{fechaVencimientoTickets}}.', 'para {{patente}}, válidos hasta el {{fechaVencimientoTickets}} (incluido).')
  where id = 'sms-vip-confirmacion' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'validos hasta el {{fechaVencimientoTickets}}.', 'validos hasta el {{fechaVencimientoTickets}} (incluido).')
  where id = 'sms-pack-confirmacion' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'válidos hasta el **{{fechaVencimientoTickets}}**', 'válidos hasta el **{{fechaVencimientoTickets}} (incluido)**')
  where id in ('correo-vip-confirmacion', 'correo-pack-confirmacion') and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'vence el {{fechaVencimientoCupon}}.', 'válido hasta el {{fechaVencimientoCupon}} (incluido).')
  where id = 'sms-proxima-visita' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'vence el {{fechaVencimientoCupon}}.', 'es válido hasta el {{fechaVencimientoCupon}} (incluido).')
  where id = 'sms-cupon-sin-visita-por-vencer' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set
    mensaje = replace(mensaje, 'vence el **{{fechaVencimientoCupon}}**', 'es válido hasta el **{{fechaVencimientoCupon}} (incluido)**'),
    nombre = replace(nombre, 'vence el {{fechaVencimientoCupon}}', 'es válido hasta el {{fechaVencimientoCupon}} (incluido)')
  where id = 'correo-cupon-sin-visita-por-vencer' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, ', hasta el {{fechaVencimientoOferta}}.', ', válido hasta el {{fechaVencimientoOferta}} (incluido).')
  where id = 'sms-sin-visita' and mensaje not like '%(incluido)%';
update plantillas_whatsapp set mensaje = replace(mensaje, 'Vale hasta el **{{fechaVencimientoOferta}}**', 'Válido hasta el **{{fechaVencimientoOferta}} (incluido)**')
  where id = 'correo-sin-visita' and mensaje not like '%(incluido)%';

-- 3) Plantillas de correo de las reglas de correo.
update plantillas_correo set cuerpo = replace(cuerpo, 'esta activo hasta el {{fechaVencimiento}}.', 'está activo y es válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'c178690597913464' and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'Vigente hasta: {{fechaVencimiento}}', 'Válido hasta: {{fechaVencimiento}} (incluido)')
  where id = 'c1786708263619892' and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'venció el {{fechaVencimiento}}.', 'fue válido hasta el {{fechaVencimiento}} (incluido) y ya venció.')
  where id in ('c1786823409458522', 'c1787019601515954') and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'Puedes pasar hasta el  {{fechaVencimiento}}.', 'Es válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'c1786809107127860' and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'vence el {{fechaVencimiento}}.', 'es válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'c178688339151046' and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'venció el {{fechaVencimiento}}, te', 'fue válido hasta el {{fechaVencimiento}} (incluido), te')
  where id = 'c1788127669758973' and cuerpo not like '%(incluido)%';
update plantillas_correo set cuerpo = replace(cuerpo, 'sigue vigente hasta el {{fechaVencimiento}}.', 'sigue válido hasta el {{fechaVencimiento}} (incluido).')
  where id = 'c1788188528932823' and cuerpo not like '%(incluido)%';
update plantillas_correo set
    cuerpo = replace(cuerpo, 'y termina el **{{fechaVencimiento}}**.', 'y es válido hasta el **{{fechaVencimiento}} (incluido)**.'),
    asunto = replace(asunto, 'termina el {{fechaVencimiento}}', 'es válido hasta el {{fechaVencimiento}} (incluido)')
  where id = 'c1788391744128278' and cuerpo not like '%(incluido)%';

-- 4) Textos del bot de WhatsApp guardados en config (pisan los del código).
update config set textos_bot_whatsapp = jsonb_set(textos_bot_whatsapp, '{patenteEstadoVencimiento}', '"Válido hasta el {{fecha}} (incluido)"')
  where textos_bot_whatsapp ? 'patenteEstadoVencimiento' and textos_bot_whatsapp->>'patenteEstadoVencimiento' not like '%(incluido)%';
update config set textos_bot_whatsapp = jsonb_set(
    textos_bot_whatsapp, '{textoDescuentoConfirmacion}',
    to_jsonb(replace(textos_bot_whatsapp->>'textoDescuentoConfirmacion', 'Válido hasta el {{fecha}}.', 'Válido hasta el {{fecha}} (incluido).')))
  where textos_bot_whatsapp->>'textoDescuentoConfirmacion' like '%Válido hasta el {{fecha}}.%';
