-- Promo X3 sin descuento (19-nov-2026): el dueño decide sacar el $9.990 del
-- primer mes. Los mensajes de fin de pack y de habitual sin plan ofrecen el
-- Plan X3 a $14.990 desde el primer mes, sin cupón: 3 lavados por $14.990 es
-- la mitad de 3 lavados sueltos ($9.990 c/u). Las reglas siguen encendidas y
-- con el mismo grupo de control (patentes terminadas en 0).
-- Seguro de re-pegar: son update por id.

-- 1. Las reglas dejan de emitir el cupón de $5.000.
update reglas_whatsapp
set accion = 'mensaje_simple', cupon_valor = null, cupon_validez_dias = null,
    nombre = replace(nombre, 'primer mes Plan X3 a $9.990', 'Plan X3 a $14.990')
where creado_por = 'claude-19-nov';

-- 2. Textos sin descuento.
update plantillas_whatsapp set nombre = 'SMS: terminó su pack, Plan X3 a $14.990', mensaje =
 'ZPlash: tenemos un plan a tu medida. Plan X3: 3 lavados Full Tunel al mes por $14.990 y ahorra un 50%. Cargo mensual automatico. Contratalo aqui: {{linkPlanX3}}'
where id = 'sms-x3-fin-pack';

update plantillas_whatsapp set nombre = 'Tenemos un plan a tu medida: ahorra un 50% con el Plan X3', mensaje =
 E'Hola {{nombre}},\n\nSe terminó tu pack de lavados para la patente {{patente}}, y tenemos un plan a tu medida.\n\nCon el **Plan X3** disfruta de **3 lavados Full Túnel al mes por $14.990** y **ahorra un 50%** frente al lavado suelto ($9.990 cada uno).\n\nEl cargo es mensual y automático a tu tarjeta.\n\nContrátalo aquí, tu patente ya viene puesta:\n{{linkPlanX3}}'
where id = 'correo-x3-fin-pack';

update plantillas_whatsapp set nombre = 'SMS: viene seguido, Plan X3 a $14.990', mensaje =
 'ZPlash: ya vienes seguido y tenemos un plan a tu medida. Plan X3: 3 lavados Full Tunel al mes por $14.990 y ahorra un 50%. Cargo mensual automatico: {{linkPlanX3}}'
where id = 'sms-x3-habitual';

update plantillas_whatsapp set nombre = 'Ya vienes seguido: ahorra un 50% con el Plan X3', mensaje =
 E'Hola {{nombre}},\n\nVimos que ya vienes seguido a lavar la patente {{patente}}, y tenemos un plan a tu medida.\n\nCon el **Plan X3** disfruta de **3 lavados Full Túnel al mes por $14.990** y **ahorra un 50%** frente al lavado suelto ($9.990 cada uno).\n\nEl cargo es mensual y automático a tu tarjeta.\n\nContrátalo aquí, tu patente ya viene puesta:\n{{linkPlanX3}}'
where id = 'correo-x3-habitual';

-- Comprobar: 4 reglas con accion = mensaje_simple, cupon_valor vacío y activa = true.
select r.id, r.activa, r.accion, r.cupon_valor, p.mensaje
from reglas_whatsapp r join plantillas_whatsapp p on p.id = r.plantilla_whatsapp_id
where r.creado_por = 'claude-19-nov' order by r.id;
