-- Código de referido también para el lavado único comprado por la web
-- (12-oct-2026). La condición de tipo de venta es exacta, así que
-- "Lavado único (Web)" no entraba en las reglas de "Lavado único". Copia las
-- dos reglas del código (SMS y correo) con ese tipo; mismo texto, monto y
-- espera de una hora. Seguro de re-pegar.

insert into reglas_whatsapp
  (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon, delay_dias, delay_minutos,
   accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias, plantilla_whatsapp_id, canal, creado_por)
select
  r.id || '-web', r.nombre || ' — web', r.activa, r.tipo_evento, 'Lavado único (Web)', r.condicion_excluir_con_cupon,
  r.delay_dias, r.delay_minutos, r.accion, r.cupon_es_porcentaje, r.cupon_valor, r.cupon_validez_dias,
  r.plantilla_whatsapp_id, r.canal, 'codigo-referido-oct-2026'
from reglas_whatsapp r
where r.id in ('sms-regalo-otro-auto', 'correo-regalo-otro-auto')
on conflict (id) do nothing;
