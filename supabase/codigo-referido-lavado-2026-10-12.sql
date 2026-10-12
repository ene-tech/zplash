-- Código de referido del lavado (12-oct-2026): reemplaza al "regalo $2.000".
-- Mismas reglas (ids sin cambiar), pero el código ahora es para regalárselo a
-- un amigo: cuando el amigo lo usa, el cron de referidos le da el premio a
-- quien lo compartió. Textos nuevos y condicion_excluir_con_cupon = false para
-- que el amigo que pagó con el código también reciba el suyo (cadena).
-- No toca activa (el SMS sigue prendido, el correo apagado) ni los 90
-- códigos "Regalo lavado - %" ya emitidos. Seguro de re-pegar.

update plantillas_whatsapp set
  nombre = 'SMS: código de referido del lavado',
  mensaje = 'ZPlash: regalale {{montoOferta}} a un amigo para su lavado con el codigo {{codigoCupon}} (vence {{fechaVencimientoCupon}}). Cuando lo use, te ganas {{descuentoReferido}} para tu proximo lavado.'
where id = 'sms-regalo-otro-auto';

update plantillas_whatsapp set
  nombre = 'Regálale {{montoOferta}} a un amigo y gana {{descuentoReferido}}',
  mensaje = E'Hola {{nombre}}, ¡gracias por lavar tu auto en ZPlash!\n\nTe dejamos un código para que se lo regales a un amigo, a tu familia o a tu pareja: **{{montoOferta}} de descuento** en su próximo lavado.\n\nCódigo: **{{codigoCupon}}**\n\nVale hasta el {{fechaVencimientoCupon}}. Solo tiene que decirlo en caja al pagar (o guardarlo en Mi Cuenta en zplash.cl).\n\nCuando tu amigo lo use, te ganas **{{descuentoReferido}} de descuento** para tu próximo lavado; se aplica solo con tu patente.\n\n¡Nos vemos en el túnel!'
where id = 'correo-regalo-otro-auto';

update reglas_whatsapp set
  nombre = case id
    when 'sms-regalo-otro-auto' then 'Lavado único: código de referido a la hora (SMS)'
    else 'Lavado único: código de referido a la hora (correo)'
  end,
  condicion_excluir_con_cupon = false
where id in ('sms-regalo-otro-auto', 'correo-regalo-otro-auto');
