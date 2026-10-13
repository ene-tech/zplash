-- Solo código de referido (12-oct-2026): se apagan los mensajes con el link
-- ?ref= de Regala y Gana. El lavado único ya recibe el código una hora
-- después (sms/correo-regalo-otro-auto). La invitación de la 1ª visita del mes
-- con plan pasa de link a código, con las mismas plantillas. No borra reglas
-- (quedan apagadas, reversibles) ni toca el link de Mi Cuenta.
-- Seguro de re-pegar.

update reglas_whatsapp set activa = false
where id in ('sms-c1785023347517636', 'correo-regala-y-gana-lavado');

update reglas_whatsapp set
  accion = 'cupon_regalo',
  cupon_es_porcentaje = false,
  cupon_valor = 2000,
  cupon_validez_dias = 15,
  plantilla_whatsapp_id = case id
    when 'sms-regla-referidos-plan-mes' then 'sms-regalo-otro-auto'
    else 'correo-regalo-otro-auto'
  end,
  nombre = case id
    when 'sms-regla-referidos-plan-mes' then 'Plan, 1ª visita del mes: código de referido (SMS)'
    else 'Plan, 1ª visita del mes: código de referido (correo)'
  end
where id in ('sms-regla-referidos-plan-mes', 'correo-regala-y-gana-mes');
