-- Texto del correo "No se pudo cobrar el plan" con el link de pago.
-- Desde el cambio de reintentos, el cron deja de insistir después de un
-- rechazo -11, de un -10 reintentado o del día 21, y manda este mismo correo.
-- Cambiar la tarjeta en "Mi Cuenta" con el plan vencido NO cobra solo, así
-- que el correo tiene que llevar a pagar: {{linkPago}} es el link de /pagar
-- con la patente puesta. Pegar DESPUÉS del deploy que agrega {{linkPago}}
-- (antes, la variable saldría vacía en el correo).
-- Toca solo las plantillas de las reglas de cobro fallido.

-- 0) Antes: la(s) plantilla(s) que usan las reglas de cobro fallido.
select p.id, p.nombre, r.nombre regla, r.activa
from plantillas_correo p join reglas_correo r on r.plantilla_correo_id = p.id
where r.tipo_evento = 'cobro_fallido';

-- Respaldo para deshacer.
create table if not exists _backup_plantillas_cobro_fallido_2026_10_21 as
select p.* from plantillas_correo p
where p.id in (select plantilla_correo_id from reglas_correo where tipo_evento = 'cobro_fallido');

-- 1) El cambio.
update plantillas_correo
set cuerpo = 'Hola {{nombre}},

Intentamos cobrar {{monto}} de tu plan {{plan}} para la patente {{patente}} y el pago no pasó.

Para no perder tu plan, págalo aquí con la misma u otra tarjeta (toma menos de un minuto):
{{linkPago}}

Si quieres dejar otra tarjeta para los próximos cobros, puedes cambiarla en "Mi Cuenta" - "Tarjetas registradas".

Si tu tarjeta está bien y el problema persiste, escríbenos y lo revisamos juntos.
'
where id in (select plantilla_correo_id from reglas_correo where tipo_evento = 'cobro_fallido');

-- Deshacer:
-- update plantillas_correo p set cuerpo = b.cuerpo from _backup_plantillas_cobro_fallido_2026_10_21 b where p.id = b.id;
