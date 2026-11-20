-- Recuperar planes (19-nov-2026), informe del agente comercial aprobado por
-- el dueño ("demosle con todo"): sin descuento y sin grupo de control.
--  1. Plan vencido sin volver: día 1 (SMS + correo), día 7 (SMS; el correo del
--     día 7 ya existe en reglas_correo), día 21 oferta del Plan X3 (SMS + correo).
--  2. Cobro automático rechazado: recordatorio a los 3, 10 y 18 días del
--     primer rechazo (SMS + correo), antes de la baja del día 21.
--  3. Inscripción de tarjeta a medias: a la hora y a las 24 h (SMS + correo).
-- Lo que vende el plan es el beneficio de suscribir el pago automático.
--
-- Pegar DESPUÉS del deploy (el código viejo no conoce estos eventos). Las
-- reglas quedan ENCENDIDAS. Seguro de re-pegar: los insert no pisan.

insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
-- 1. Plan vencido
('sms-vencido-1', 'SMS: plan vencido hace 1 día', 'sms',
 'ZPlash: tu plan de {{patente}} vencio. Renuevalo con cobro automatico y sigue disfrutando tus lavados Full Tunel del mes, el beneficio de tener tu pago suscrito: {{linkPago}}', true),
('correo-vencido-1', 'Tu plan ZPlash venció: renuévalo en un minuto', 'correo',
 E'Hola {{nombre}},\n\nTu plan para la patente {{patente}} fue válido hasta el {{fechaVencimiento}} (incluido) y ya venció.\n\nRenuévalo con **cobro mensual automático** y sigue disfrutando de tus **lavados Full Túnel del mes**: es el beneficio exclusivo de tener tu pago suscrito, sin preocuparte de renovar cada mes.\n\nRenueva aquí, tu patente ya viene puesta:\n{{linkPago}}', true),
('sms-vencido-7', 'SMS: plan vencido hace 7 días', 'sms',
 'ZPlash: te extranamos! Tu plan de {{patente}} sigue vencido. Suscribe tu pago automatico y recupera tus lavados Full Tunel del mes: {{linkPago}}', true),
('sms-vencido-21-x3', 'SMS: plan vencido hace 21 días, oferta Plan X3', 'sms',
 'ZPlash: tenemos un plan a tu medida. Plan X3: 3 lavados Full Tunel al mes por $14.990 y ahorra un 50%. Cargo mensual automatico: {{linkPlanX3}}', true),
('correo-vencido-21-x3', 'Tenemos un plan a tu medida: ahorra un 50% con el Plan X3', 'correo',
 E'Hola {{nombre}},\n\nTu plan para la patente {{patente}} sigue vencido, y tenemos un plan a tu medida.\n\nCon el **Plan X3** disfruta de **3 lavados Full Túnel al mes por $14.990** y **ahorra un 50%** frente al lavado suelto ($9.990 cada uno).\n\nEl cargo es mensual y automático a tu tarjeta.\n\nContrátalo aquí, tu patente ya viene puesta:\n{{linkPlanX3}}', true),
-- 2. Cobro rechazado
('sms-cobro-rechazado-recordatorio', 'SMS: cobro rechazado, recordatorio', 'sms',
 'ZPlash: aun no pudimos cobrar tu {{plan}} de {{patente}}. Pagalo con la misma u otra tarjeta y no pierdas tus lavados del mes: {{linkPago}}', true),
('correo-cobro-rechazado-recordatorio', 'Aún no pudimos cobrar tu plan ZPlash', 'correo',
 E'Hola {{nombre}},\n\nTodavía no pudimos cobrar {{monto}} de tu {{plan}} para la patente {{patente}}.\n\nPara no perder tus lavados del mes y el beneficio de tu pago suscrito, págalo aquí con la misma u otra tarjeta (toma menos de un minuto):\n{{linkPago}}\n\nSi tu tarjeta está bien y el problema persiste, escríbenos y lo revisamos juntos.', true),
('sms-cobro-rechazado-ultimo', 'SMS: cobro rechazado, último aviso', 'sms',
 'ZPlash: ultimo aviso, en 3 dias se cancela tu {{plan}} de {{patente}} porque no pudimos cobrarlo. Pagalo con la misma u otra tarjeta: {{linkPago}}', true),
('correo-cobro-rechazado-ultimo', 'Último aviso: en 3 días se cancela tu plan ZPlash', 'correo',
 E'Hola {{nombre}},\n\nSeguimos sin poder cobrar {{monto}} de tu {{plan}} para la patente {{patente}}, y **en 3 días se cancela tu plan**.\n\nPara mantener tus lavados del mes y el beneficio de tu pago suscrito, págalo aquí con la misma u otra tarjeta:\n{{linkPago}}\n\nSi tu tarjeta está bien y el problema persiste, escríbenos y lo revisamos juntos.', true),
-- 3. Inscripción a medias
('sms-inscripcion-pendiente-1h', 'SMS: inscripción a medias (1 h)', 'sms',
 'ZPlash: te falto un paso para activar tu {{plan}} de {{patente}}. Termina de inscribir tu tarjeta aqui: {{linkPago}}', true),
('correo-inscripcion-pendiente-1h', 'Te faltó un paso para activar tu plan ZPlash', 'correo',
 E'Hola,\n\nEmpezaste a contratar el **{{plan}}** para la patente {{patente}}, pero la inscripción de tu tarjeta quedó a medias.\n\nTermínala aquí, tu patente ya viene puesta (toma menos de un minuto):\n{{linkPago}}\n\nSi tuviste algún problema con el pago, escríbenos y te ayudamos.', true),
('sms-inscripcion-pendiente-24h', 'SMS: inscripción a medias (24 h)', 'sms',
 'ZPlash: tu {{plan}} para {{patente}} te espera. Activalo con cobro automatico y disfruta tus lavados Full Tunel del mes: {{linkPago}}', true),
('correo-inscripcion-pendiente-24h', 'Tu plan ZPlash te espera', 'correo',
 E'Hola,\n\nAyer empezaste a contratar el **{{plan}}** para la patente {{patente}} y quedó a medias.\n\nActívalo con **cobro mensual automático** y disfruta de tus lavados Full Túnel del mes, sin preocuparte de renovar:\n{{linkPago}}\n\nSi tuviste algún problema con el pago, escríbenos y te ayudamos.', true)
on conflict (id) do nothing;

-- condicion_dias_antes_vencimiento: días (vencido, rechazado) u HORAS (inscripción).
insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_dias_antes_vencimiento, delay_dias, delay_minutos, accion, cupon_es_porcentaje, cupon_valor, cupon_validez_dias,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-vencido-1', 'Plan vencido hace 1 día (SMS)', true, 'plan_vencido_dias', null, false, 1, 0, null, 'mensaje_simple', false, null, null, 'sms-vencido-1', 'sms', 'claude-19-nov-recuperar'),
('correo-vencido-1', 'Plan vencido hace 1 día (correo)', true, 'plan_vencido_dias', null, false, 1, 0, null, 'mensaje_simple', false, null, null, 'correo-vencido-1', 'correo', 'claude-19-nov-recuperar'),
('sms-vencido-7', 'Plan vencido hace 7 días (SMS)', true, 'plan_vencido_dias', null, false, 7, 0, null, 'mensaje_simple', false, null, null, 'sms-vencido-7', 'sms', 'claude-19-nov-recuperar'),
('sms-vencido-21-x3', 'Plan vencido hace 21 días: Plan X3 (SMS)', true, 'plan_vencido_dias', null, false, 21, 0, null, 'mensaje_simple', false, null, null, 'sms-vencido-21-x3', 'sms', 'claude-19-nov-recuperar'),
('correo-vencido-21-x3', 'Plan vencido hace 21 días: Plan X3 (correo)', true, 'plan_vencido_dias', null, false, 21, 0, null, 'mensaje_simple', false, null, null, 'correo-vencido-21-x3', 'correo', 'claude-19-nov-recuperar'),
('sms-cobro-rechazado-3', 'Cobro rechazado hace 3 días (SMS)', true, 'cobro_rechazado_recordatorio', null, false, 3, 0, null, 'mensaje_simple', false, null, null, 'sms-cobro-rechazado-recordatorio', 'sms', 'claude-19-nov-recuperar'),
('correo-cobro-rechazado-3', 'Cobro rechazado hace 3 días (correo)', true, 'cobro_rechazado_recordatorio', null, false, 3, 0, null, 'mensaje_simple', false, null, null, 'correo-cobro-rechazado-recordatorio', 'correo', 'claude-19-nov-recuperar'),
('sms-cobro-rechazado-10', 'Cobro rechazado hace 10 días (SMS)', true, 'cobro_rechazado_recordatorio', null, false, 10, 0, null, 'mensaje_simple', false, null, null, 'sms-cobro-rechazado-recordatorio', 'sms', 'claude-19-nov-recuperar'),
('correo-cobro-rechazado-10', 'Cobro rechazado hace 10 días (correo)', true, 'cobro_rechazado_recordatorio', null, false, 10, 0, null, 'mensaje_simple', false, null, null, 'correo-cobro-rechazado-recordatorio', 'correo', 'claude-19-nov-recuperar'),
('sms-cobro-rechazado-18', 'Cobro rechazado hace 18 días: último aviso (SMS)', true, 'cobro_rechazado_recordatorio', null, false, 18, 0, null, 'mensaje_simple', false, null, null, 'sms-cobro-rechazado-ultimo', 'sms', 'claude-19-nov-recuperar'),
('correo-cobro-rechazado-18', 'Cobro rechazado hace 18 días: último aviso (correo)', true, 'cobro_rechazado_recordatorio', null, false, 18, 0, null, 'mensaje_simple', false, null, null, 'correo-cobro-rechazado-ultimo', 'correo', 'claude-19-nov-recuperar'),
('sms-inscripcion-pendiente-1h', 'Inscripción a medias hace 1 hora (SMS)', true, 'inscripcion_pendiente', null, false, 1, 0, null, 'mensaje_simple', false, null, null, 'sms-inscripcion-pendiente-1h', 'sms', 'claude-19-nov-recuperar'),
('correo-inscripcion-pendiente-1h', 'Inscripción a medias hace 1 hora (correo)', true, 'inscripcion_pendiente', null, false, 1, 0, null, 'mensaje_simple', false, null, null, 'correo-inscripcion-pendiente-1h', 'correo', 'claude-19-nov-recuperar'),
('sms-inscripcion-pendiente-24h', 'Inscripción a medias hace 24 horas (SMS)', true, 'inscripcion_pendiente', null, false, 24, 0, null, 'mensaje_simple', false, null, null, 'sms-inscripcion-pendiente-24h', 'sms', 'claude-19-nov-recuperar'),
('correo-inscripcion-pendiente-24h', 'Inscripción a medias hace 24 horas (correo)', true, 'inscripcion_pendiente', null, false, 24, 0, null, 'mensaje_simple', false, null, null, 'correo-inscripcion-pendiente-24h', 'correo', 'claude-19-nov-recuperar')
on conflict (id) do nothing;

-- Comprobar: 15 reglas encendidas.
select id, activa, tipo_evento, condicion_dias_antes_vencimiento from reglas_whatsapp
where creado_por = 'claude-19-nov-recuperar' order by tipo_evento, condicion_dias_antes_vencimiento, canal;

-- Apagar todo:
-- update reglas_whatsapp set activa = false where creado_por = 'claude-19-nov-recuperar';
