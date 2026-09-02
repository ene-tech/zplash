-- Prende el recordatorio de renovación 5 días antes (paso 2 de 2).
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano).
--
-- QUÉ HACE: pone `activa = true` en "Recordatorio renovación próxima". Es la
-- regla que nunca ha disparado, y la de mayor valor: avisa al cliente antes
-- de que se le venza el plan, en vez de perderlo en silencio.
--
-- OJO CON LA PRIMERA CORRIDA: el cron no busca "los que vencen exactamente en
-- 5 días", busca el RANGO entre ahora y ahora + 5 días (ver
-- procesarPendientesYVencimientos en @/lib/whatsapp/reglas/cron.ts). Hoy hay
-- 136 clientes en ese rango, todos con teléfono: la primera corrida manda 136
-- mensajes de una sola vez. Recién desde el día siguiente se estabiliza en
-- los que van entrando al rango, ~27 al día.
--
-- CUÁNDO SE DISPARA: el cron corre una vez al día a las 14:00 UTC (ver
-- vercel.json), o sea 10:00/11:00 en Chile según horario de verano. Si se
-- quiere ver el estanque antes de abrir la llave, correr primero:
--
--   select count(*) from clientes
--   where vencimiento is not null
--     and vencimiento >= now() and vencimiento <= now() + interval '5 days';
--
-- QUÉ RESPONDE: "UPDATE 1".
--
-- QUÉ NO TOCA: nada retroactivo. El `origen_id` del disparo incluye el
-- vencimiento exacto del cliente, así que nadie recibe el aviso dos veces por
-- el mismo ciclo, y quien renueva vuelve a ser elegible en el ciclo siguiente.
--
-- CÓMO SE APAGA: el mismo update con `activa = false`.

update reglas_whatsapp
set activa = true
where nombre = 'Recordatorio renovación próxima';
