-- Deja canceladas y sin fecha de cobro las 4 suscripciones Oneclick rotas
-- (re-inscripciones que el bug de sep-2026 dejó en un estado que el cron no
-- cobra). Decisión del 20-oct-2026: cancelarlas limpio en vez de revivirlas,
-- para que ningún cron les cobre por sorpresa. Si el cliente vuelve, inscribe
-- su tarjeta de nuevo. No toca clientes, ventas ni cobros.

-- 0) Antes: deberían salir 4 filas (3 'cancelada' y SBVJ21 'pendiente').
select id, patente, estado, proximo_cobro
from suscripciones_oneclick
where id in ('c178785588709351', 'c1789232885464659', 'c1786361310551834', 'c1788097781448566');

-- 1) El cambio.
update suscripciones_oneclick
set estado = 'cancelada', proximo_cobro = null, actualizado_en = now()
where id in ('c178785588709351', 'c1789232885464659', 'c1786361310551834', 'c1788097781448566');

-- Deshacer (estado al 21-oct-2026):
-- update suscripciones_oneclick set estado = 'cancelada', proximo_cobro = '2026-09-27T18:39:31.062Z' where id = 'c178785588709351';
-- update suscripciones_oneclick set estado = 'cancelada', proximo_cobro = '2026-10-12T17:13:40.851Z' where id = 'c1789232885464659';
-- update suscripciones_oneclick set estado = 'pendiente', proximo_cobro = '2026-09-16T23:00:00.000Z' where id = 'c1786361310551834';
-- update suscripciones_oneclick set estado = 'cancelada', proximo_cobro = '2026-09-30T13:52:22.651Z' where id = 'c1788097781448566';
