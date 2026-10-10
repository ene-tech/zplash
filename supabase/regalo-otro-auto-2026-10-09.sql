-- Regalo del lavado (oct-2026): una hora después de un lavado único pagado
-- (sin cupón), si en esa hora el cliente no compró tickets, recibe un código
-- de $2.000 válido 15 días, abierto para cualquier auto (incluido el suyo).
-- Sale por SMS y por correo con el MISMO código. Las reglas quedan APAGADAS:
-- se prenden desde Web Settings → Reglas, después del deploy.
-- Seguro de re-pegar: la columna con if not exists y el resto con on conflict
-- do update (deja los textos y reglas como están acá, salvo activa).

alter table reglas_whatsapp add column if not exists delay_minutos integer;

insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
  ('sms-regalo-otro-auto', 'SMS: regalo del lavado', 'sms',
   'ZPlash: te regalamos {{montoOferta}} para tu proximo lavado o el de quien quieras. Codigo {{codigoCupon}}, vence {{fechaVencimientoCupon}}. Dilo en caja.',
   true),
  ('correo-regalo-otro-auto', 'Te regalamos {{montoOferta}} para tu próximo lavado', 'correo',
   E'Hola {{nombre}}, ¡gracias por lavar tu auto en ZPlash!\n\nTe regalamos **{{montoOferta}} de descuento** para tu próximo lavado, o para el auto de quien tú quieras: un amigo, tu familia o tu pareja.\n\nCódigo: **{{codigoCupon}}**\n\nVale hasta el {{fechaVencimientoCupon}}. Solo hay que decirlo en caja al pagar el lavado (o guardarlo en Mi Cuenta en zplash.cl).\n\n¡Nos vemos en el túnel!',
   true)
on conflict (id) do update set nombre = excluded.nombre, mensaje = excluded.mensaje;

insert into reglas_whatsapp
  (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon, delay_dias, delay_minutos,
   accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias, plantilla_whatsapp_id, canal, creado_por)
values
  ('sms-regalo-otro-auto', 'Lavado único: regalo $2.000 a la hora (SMS)', false, 'venta_creada', 'Lavado único', true, 0, 60,
   'cupon_regalo', false, 2000, 15, 'sms-regalo-otro-auto', 'sms', 'regalo-lavado-oct-2026'),
  ('correo-regalo-otro-auto', 'Lavado único: regalo $2.000 a la hora (correo)', false, 'venta_creada', 'Lavado único', true, 0, 60,
   'cupon_regalo', false, 2000, 15, 'correo-regalo-otro-auto', 'correo', 'regalo-lavado-oct-2026')
on conflict (id) do update set
  nombre = excluded.nombre, delay_minutos = excluded.delay_minutos,
  cupon_valor = excluded.cupon_valor, cupon_validez_dias = excluded.cupon_validez_dias;
