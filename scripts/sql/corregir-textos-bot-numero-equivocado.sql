-- Corrige los dos textos del bot de WhatsApp que mandan al cliente a la
-- opción equivocada del menú.
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano). También se
-- pueden editar a mano desde la app, en Web Settings → Menú Bot WhatsApp:
-- es el mismo campo, este SQL solo evita tener que buscarlos.
--
-- POR QUÉ NO BASTA CON DEPLOYAR: estos textos están guardados en la columna
-- `textos_bot_whatsapp` de `config`, y getConfig los mergea ENCIMA de
-- TEXTOS_BOT_WHATSAPP_DEFAULT (@/lib/helpers/whatsapp). O sea: lo que está
-- en la base pisa lo que dice el código. Los defaults ya quedaron corregidos
-- en el repo, pero mientras esta fila tenga el texto viejo, el cliente sigue
-- viendo el texto viejo.
--
-- QUÉ HACE:
--
--   1. patenteNoEncontrada — decía "escribe *3* para hablar con una
--      persona". El 3 es "Horario y ubicación"; la persona es el 4. Al
--      cliente que escribió mal su patente lo mandaba a leer la dirección.
--
--   2. patenteEstadoAvisoVencido — decía "Escribe *1* para ver precios de
--      renovación". El 1 es la lista de precios: muestra el valor del plan,
--      pero sin link para pagarlo. El 2 arma el checkout con la patente del
--      cliente ya puesta (zplash.cl/pagar?item=plan&patente=XX, ver
--      textoContratarPlan en @/lib/whatsapp/router). Al cliente con el plan
--      vencido —el que más interesa recuperar— se le estaba dando el camino
--      largo.
--
-- QUÉ RESPONDE: "UPDATE 1". La tabla `config` tiene una sola fila.
--
-- QUÉ NO TOCA: ningún otro texto del bot. Se revisaron los 4 campos que
-- mencionan un número de menú; los otros dos (textoDescuentoYaCliente manda
-- al 1 = precios, textoCambioPatenteYaExiste manda al 4 = persona) ya
-- apuntan bien y quedan como están. Tampoco toca clientes, planes ni cobros.
--
-- CÓMO SE DESHACE: el mismo update con los textos de antes —
--   '... o escribe *3* para hablar con una persona.'
--   'Tu plan no está vigente. Escribe *1* para ver precios de renovación.'

update config
set textos_bot_whatsapp = jsonb_set(
  jsonb_set(
    textos_bot_whatsapp,
    '{patenteNoEncontrada}',
    to_jsonb('No encontramos ningún cliente con esa patente. Verifica que esté bien escrita (ej. AB1234) o escribe *4* para hablar con una persona.'::text)
  ),
  '{patenteEstadoAvisoVencido}',
  to_jsonb('Tu plan no está vigente. Escribe *2* para renovarlo.'::text)
);

-- Para confirmar que quedó bien:
--
--   select textos_bot_whatsapp->>'patenteNoEncontrada' as no_encontrada,
--          textos_bot_whatsapp->>'patenteEstadoAvisoVencido' as aviso_vencido
--   from config;
