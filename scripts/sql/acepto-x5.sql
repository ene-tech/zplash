-- Candado del paso del "Plan Ilimitado Mensual" al "Plan X5".
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano).
--
-- QUÉ HACE: agrega una columna a `clientes` que guarda CUÁNDO el cliente
-- aceptó pasar del plan ilimitado viejo al X5. Mientras esté en NULL, ningún
-- camino de cobro puede migrarlo — la renovación automática ni siquiera le
-- cobra, y en la web y el mesón el botón queda bloqueado hasta que marque la
-- casilla.
--
-- QUÉ RESPONDE: "ok, ALTER TABLE" (o "Success. No rows returned").
--
-- QUÉ NO TOCA: no modifica ninguna fila existente. Todos los clientes quedan
-- con NULL, que es lo correcto: nadie ha aceptado todavía. Los 150 que YA
-- fueron pasados al X5 no se ven afectados porque su `plan` ya dice "Plan X5"
-- y el candado solo mira a los que siguen en el plan viejo.

alter table clientes add column if not exists acepto_x5_en timestamptz;

-- Los que ya pasaron por una pantalla con el aviso y aceptaron pagando no
-- necesitan volver a aceptar, pero NO se rellenan acá a propósito: la fecha de
-- esta columna es prueba de consentimiento y no se puede inventar hacia atrás.

-- Índice no hace falta: la columna solo se consulta junto al id o la patente
-- del cliente, que ya están indexados.

select count(*) filter (where acepto_x5_en is null and plan = 'Plan Ilimitado Mensual') as pendientes_de_aceptar,
       count(*) filter (where acepto_x5_en is not null) as ya_aceptaron
from clientes;
