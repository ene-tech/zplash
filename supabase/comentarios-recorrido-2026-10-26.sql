-- Comentarios del dueño en el artifact "Recorrido del cliente ZPlash" (26-oct-2026).
-- Dos bloques, en este orden: el 1 ANTES del deploy (el código nuevo lee la
-- columna), el 2 DESPUÉS. Los dos se pueden pegar de nuevo sin efecto.

-- ============ BLOQUE 1: pegar ANTES del deploy ============
alter table reglas_whatsapp add column if not exists condicion_pasadas_max integer;

-- ============ BLOQUE 2: pegar DESPUÉS del deploy ============

-- 1. Textos nuevos
insert into plantillas_whatsapp (id, nombre, categoria, mensaje, activo) values
('sms-bienvenida-x5', 'SMS: bienvenida al plan con cobro automático', 'sms',
 'ZPlash: bienvenido a tu {{plan}}! La patente {{patente}} ya tiene sus lavados del mes con cobro automatico, vigente hasta el {{fechaVencimiento}}. Revisa tu plan en zplash.cl/cliente', true),
('correo-bienvenida-x5', 'Bienvenido a tu {{plan}} en ZPlash', 'correo',
 E'Hola {{nombre}}, ¡bienvenido a ZPlash!\n\nTu **{{plan}}** para la patente **{{patente}}** ya está activo, vigente hasta el **{{fechaVencimiento}}**.\n\nAsí funciona:\n\n- Tienes **5 lavados** en cada ciclo del plan. Al llegar solo di tu patente en el mesón.\n- Si necesitas más, cada lavado extra cuesta **{{precioLavadoAdicional}}**.\n- El plan se renueva solo con tu tarjeta cada mes: no tienes que hacer nada.\n\nEn **Mi Cuenta** (zplash.cl/cliente, con tu patente) puedes ver tus lavados, cambiar la tarjeta o cancelar la renovación cuando quieras.\n\n¡Nos vemos en el túnel!', true),
-- Sale en la 4ª y en la 5ª pasada: el número va como dato ("...: 0") para que
-- se lea bien también cuando ya no le quedan.
('correo-plan-ultimos-lavados', 'Tus últimos lavados del plan y el lavado extra', 'correo',
 E'Hola {{nombre}}, gracias por pasar hoy por ZPlash.\n\nYa vas en los últimos lavados de este ciclo de tu plan.\n\nLavados incluidos que te quedan en este ciclo: **{{lavadosRestantes}}**\n\nSi necesitas más antes de que se renueve, cada lavado extra cuesta **{{precioLavadoAdicional}}**, directo en el mesón.', true),
('sms-plan-ultimos-lavados', 'SMS: últimos lavados del ciclo del plan', 'sms',
 'ZPlash: lavados de tu plan que te quedan este ciclo: {{lavadosRestantes}}. Si necesitas mas, el lavado extra cuesta {{precioLavadoAdicional}} en el meson.', true)
on conflict (id) do nothing;

-- 2. Reglas nuevas, prendidas
insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon,
  condicion_pasadas_min, condicion_pasadas_max, delay_dias, delay_minutos, accion, cupon_es_porcentaje,
  plantilla_whatsapp_id, canal, creado_por) values
('sms-bienvenida-x5', 'Alta Oneclick: bienvenida (SMS)', true, 'venta_creada', 'Alta Oneclick', false,
  null, null, 0, null, 'mensaje_simple', false, 'sms-bienvenida-x5', 'sms', 'claude-26-oct'),
('correo-bienvenida-x5', 'Alta Oneclick: bienvenida (correo)', true, 'venta_creada', 'Alta Oneclick', false,
  null, null, 0, null, 'mensaje_simple', false, 'correo-bienvenida-x5', 'correo', 'claude-26-oct'),
('correo-plan-ultimos-lavados', 'Plan: 4ª y 5ª pasada, lavado extra (correo)', true, 'ingreso_plan_registrado', null, false,
  4, 5, 0, null, 'mensaje_simple', false, 'correo-plan-ultimos-lavados', 'correo', 'claude-26-oct'),
('sms-plan-ultimos-lavados', 'Plan: 4ª y 5ª pasada, lavado extra (SMS)', true, 'ingreso_plan_registrado', null, false,
  4, 5, 0, null, 'mensaje_simple', false, 'sms-plan-ultimos-lavados', 'sms', 'claude-26-oct')
on conflict (id) do nothing;

-- 3. El correo de cada pasada del plan queda para la 1ª a la 3ª (la 4ª y 5ª
--    reciben el de arriba, que avisa del lavado extra).
update reglas_whatsapp set condicion_pasadas_max = 3 where id = 'correo-plan-lavados-restantes';

-- 4. El SMS de plan contratado también para "Plan nuevo (Web)". Hoy casi no
--    se graba (2 en 30 días): el alta web normal es por Oneclick y recibe la
--    bienvenida de arriba.
update reglas_whatsapp set condicion_tipo_venta = 'Plan nuevo|Plan nuevo (Web)' where id = 'sms-c1785028292938367';
