-- Corrección de anclas de ciclo descuadradas (sep-2026). Regenerado el 8-sep-2026: A y B1 sin cambios, +1 en B2. Pegar en Supabase →
-- SQL Editor, bloque por bloque y en orden. Sale de
-- scripts/diag-ancla-desalineada.mts (solo lectura; volver a correrlo antes
-- de pegar si pasaron días: `npx tsx --env-file=.env.local scripts/diag-ancla-desalineada.mts`).
--
-- Qué arregla: hasta el 31-ago (commit 7976468) una reactivación que
-- reiniciaba el ciclo no movía `fecha_contratacion`. Como el cobro automático
-- (Oneclick, Woo, Webpay) calcula el vencimiento nuevo desde esa ancla, al
-- cliente le cobraban un mes y le daban días (JBDZ77: pagó 17.990 el 1-sep y
-- quedó vigente hasta el 6-sep).
--
-- Seguridad: cada UPDATE exige el vencimiento actual exacto. Si el cliente
-- renovó entre el diagnóstico y el pegado, no lo toca (responde 0 filas y hay
-- que volver a correr el diagnóstico). Correrlo dos veces no cambia nada.
--
-- Bloques:
--   A  · 18 clientes: solo se mueve `fecha_contratacion` al día de la venta
--        que arrancó el ciclo. El vencimiento ya es el correcto. Efecto: la
--        ventana de pasadas del X5 coincide con el mes pagado, y el próximo
--        cobro automático da un mes entero.
--   B1 ·  7 clientes: pagaron un mes y recibieron entre 5 y 23 días. Se les da
--        el mes completo contado desde el pago (criterio generoso: al que pagó
--        el 31-ago se le deja hasta el 30-sep) y se mueve `proximo_cobro` de
--        Oneclick al vencimiento nuevo, que es la convención del código.
--   B2 ·  8 clientes, OPCIONAL y comentado: también recibieron período corto,
--        pero por la regla del código "la vigencia sigue la contratación
--        aunque el pago llegue tarde" (web y Woo), no por el bug. Descomentar
--        solo si se decide ser generoso con ellos también.
--
-- No entran acá: 49 clientes con el vencimiento a ±1 día del borde (41 con
-- Woo). Es el desfase entre el día que Woo cobra y nuestra ancla; se arregla
-- en el webhook, no con SQL.

-- 0) Verificar: debe devolver 25 filas (A + B1). Si devuelve menos, alguien
--    de la lista renovó y hay que volver a correr el diagnóstico.
select patente, vencimiento, fecha_contratacion from clientes where (id, vencimiento) in (values
  ('c1783379878207191', '2026-09-27T03:00:00.000Z'::timestamptz),
  ('c1783380142928125', '2026-09-21T22:11:45.333Z'::timestamptz),
  ('c1783380142931449', '2026-09-27T15:02:20.928Z'::timestamptz),
  ('c1783379878207157', '2026-09-26T03:00:00.000Z'::timestamptz),
  ('c1783379878207193', '2026-09-27T03:00:00.000Z'::timestamptz),
  ('c1783379878207622', '2026-09-27T03:00:00.000Z'::timestamptz),
  ('c1783379878207534', '2026-09-26T03:00:00.000Z'::timestamptz),
  ('c1783379878212607', '2026-09-17T00:00:00.000Z'::timestamptz),
  ('c1783379878211849', '2026-09-18T20:11:14.351Z'::timestamptz),
  ('c1783379878211864', '2026-09-16T12:29:52.335Z'::timestamptz),
  ('c1783379878208540', '2026-09-25T03:00:00.000Z'::timestamptz),
  ('c1783379878208495', '2026-09-25T15:16:29.614Z'::timestamptz),
  ('c178337987820857', '2026-09-26T03:00:00.000Z'::timestamptz),
  ('c1783379878208630', '2026-09-25T03:00:00.000Z'::timestamptz),
  ('c1783379878208673', '2026-09-26T03:00:00.000Z'::timestamptz),
  ('c1783379878211860', '2026-09-16T03:00:00.000Z'::timestamptz),
  ('c1783379878207994', '2026-09-27T03:00:00.000Z'::timestamptz),
  ('c1783379878207599', '2026-09-27T14:05:27.825Z'::timestamptz),
  ('c1783379878213749', '2026-09-12T20:48:14.000Z'::timestamptz),
  ('c1783379878211994', '2026-09-15T23:58:25.999Z'::timestamptz),
  ('c1783380142926934', '2026-09-17T20:37:00.000Z'::timestamptz),
  ('c1783379878213886', '2026-09-11T22:18:22.000Z'::timestamptz),
  ('c1783379878213875', '2026-09-11T20:08:09.000Z'::timestamptz),
  ('c1783379878216179', '2026-09-06T19:17:53.999Z'::timestamptz),
  ('c1783379878208892', '2026-09-22T23:08:46.999Z'::timestamptz));

-- A) Reinicio sin mover el ancla: 18 filas. Cada línea responde "UPDATE 1".
update clientes set fecha_contratacion = '2026-08-28T12:03:46.860Z' where id = 'c1783379878207191' and vencimiento = '2026-09-27T03:00:00.000Z'; -- JSRP57
update clientes set fecha_contratacion = '2026-08-22T22:11:45.333Z' where id = 'c1783380142928125' and vencimiento = '2026-09-21T22:11:45.333Z'; -- VXJB29
update clientes set fecha_contratacion = '2026-08-28T16:02:20.928Z' where id = 'c1783380142931449' and vencimiento = '2026-09-27T15:02:20.928Z'; -- LLJL61
update clientes set fecha_contratacion = '2026-08-27T18:50:47.508Z' where id = 'c1783379878207157' and vencimiento = '2026-09-26T03:00:00.000Z'; -- KKTB70
update clientes set fecha_contratacion = '2026-08-28T19:40:01.237Z' where id = 'c1783379878207193' and vencimiento = '2026-09-27T03:00:00.000Z'; -- SDGJ21
update clientes set fecha_contratacion = '2026-08-28T16:18:09.720Z' where id = 'c1783379878207622' and vencimiento = '2026-09-27T03:00:00.000Z'; -- LHXK60
update clientes set fecha_contratacion = '2026-08-28T03:35:34.670Z' where id = 'c1783379878207534' and vencimiento = '2026-09-26T03:00:00.000Z'; -- PXSL52
update clientes set fecha_contratacion = '2026-08-18T00:17:33.126Z' where id = 'c1783379878212607' and vencimiento = '2026-09-17T00:00:00.000Z'; -- SRXC52
update clientes set fecha_contratacion = '2026-08-19T20:22:13.088Z' where id = 'c1783379878211849' and vencimiento = '2026-09-18T20:11:14.351Z'; -- TZCK25
update clientes set fecha_contratacion = '2026-08-17T13:29:52.335Z' where id = 'c1783379878211864' and vencimiento = '2026-09-16T12:29:52.335Z'; -- VWHX33
update clientes set fecha_contratacion = '2026-08-26T15:02:02.296Z' where id = 'c1783379878208540' and vencimiento = '2026-09-25T03:00:00.000Z'; -- VKDP92
update clientes set fecha_contratacion = '2026-08-26T15:16:29.614Z' where id = 'c1783379878208495' and vencimiento = '2026-09-25T15:16:29.614Z'; -- TJWP90
update clientes set fecha_contratacion = '2026-08-27T16:55:57.033Z' where id = 'c178337987820857' and vencimiento = '2026-09-26T03:00:00.000Z'; -- RSSH50
update clientes set fecha_contratacion = '2026-08-26T18:15:43.219Z' where id = 'c1783379878208630' and vencimiento = '2026-09-25T03:00:00.000Z'; -- TJXZ46
update clientes set fecha_contratacion = '2026-08-27T18:36:25.292Z' where id = 'c1783379878208673' and vencimiento = '2026-09-26T03:00:00.000Z'; -- SJFD60
update clientes set fecha_contratacion = '2026-08-17T19:26:50.834Z' where id = 'c1783379878211860' and vencimiento = '2026-09-16T03:00:00.000Z'; -- SPJJ42
update clientes set fecha_contratacion = '2026-08-28T15:23:27.109Z' where id = 'c1783379878207994' and vencimiento = '2026-09-27T03:00:00.000Z'; -- VJCL65
update clientes set fecha_contratacion = '2026-08-28T15:05:27.825Z' where id = 'c1783379878207599' and vencimiento = '2026-09-27T14:05:27.825Z'; -- SPRD68

-- B1) Período corto por el bug: 7 filas. Vencimiento nuevo a mediodía de Chile.
update clientes set fecha_contratacion = '2026-08-22T19:01:34.681Z', vencimiento = ('2026-09-21 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878213749' and vencimiento = '2026-09-12T20:48:14.000Z'; -- VPGS30: 12-sep → 21-sep
update clientes set fecha_contratacion = '2026-08-31T16:53:25.291Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878211994' and vencimiento = '2026-09-15T23:58:25.999Z'; -- BSHW31: 15-sep → 30-sep
update clientes set fecha_contratacion = '2026-08-31T21:26:04.818Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783380142926934' and vencimiento = '2026-09-17T20:37:00.000Z'; -- HRRI61: 17-sep → 30-sep
update clientes set fecha_contratacion = '2026-08-19T17:47:48.121Z', vencimiento = ('2026-09-18 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878213886' and vencimiento = '2026-09-11T22:18:22.000Z'; -- LBVK23: 11-sep → 18-sep
update clientes set fecha_contratacion = '2026-08-31T05:08:15.000Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878213875' and vencimiento = '2026-09-11T20:08:09.000Z'; -- PDWC92: 11-sep → 30-sep
update clientes set fecha_contratacion = '2026-09-01T13:00:16.467Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878216179' and vencimiento = '2026-09-06T19:17:53.999Z'; -- JBDZ77: 6-sep (vencido) → 30-sep
update clientes set fecha_contratacion = '2026-08-31T17:38:01.437Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878208892' and vencimiento = '2026-09-22T23:08:46.999Z'; -- KRRC31: 22-sep → 30-sep

-- B1-Oneclick) Próximo cobro al vencimiento nuevo: 5 filas. Mirar antes:
select patente, proximo_cobro from suscripciones_oneclick where estado = 'activa' and patente in ('BSHW31', 'HRRI61', 'PDWC92', 'JBDZ77', 'KRRC31');
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'BSHW31' and estado = 'activa'; -- 15-sep → 30-sep
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'HRRI61' and estado = 'activa'; -- 17-sep → 30-sep
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'PDWC92' and estado = 'activa'; -- 11-sep → 30-sep
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'JBDZ77' and estado = 'activa'; -- ya estaba en 30-sep
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'KRRC31' and estado = 'activa'; -- 22-sep → 30-sep

-- B2) OPCIONAL, 8 filas. El código ancla a propósito (regla web/Woo: la
--     vigencia sigue la contratación aunque el pago llegue tarde). Descomentar
--     solo si se decide darles el mes completo igual.
/*
update clientes set fecha_contratacion = '2026-08-13T22:00:19.000Z', vencimiento = ('2026-09-12 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783981317121737' and vencimiento = '2026-09-05T20:49:57.000Z'; -- RLVH74: 5-sep → 12-sep (Woo)
update clientes set fecha_contratacion = '2026-08-12T17:57:41.000Z', vencimiento = ('2026-09-11 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878204741' and vencimiento = '2026-09-05T04:08:08.000Z'; -- VHFY12: 5-sep → 11-sep
update clientes set fecha_contratacion = '2026-08-20T22:00:41.219Z', vencimiento = ('2026-09-19 12:00'::timestamp at time zone 'America/Santiago') where id = 'c-wc-4988' and vencimiento = '2026-09-08T18:40:31.000Z'; -- SJPF62: 8-sep → 19-sep
update clientes set fecha_contratacion = '2026-08-23T18:00:34.308Z', vencimiento = ('2026-09-22 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878212458' and vencimiento = '2026-09-14T23:40:25.999Z'; -- VRHT17: 14-sep → 22-sep
update clientes set fecha_contratacion = '2026-09-02T22:07:08.000Z', vencimiento = ('2026-10-01 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878208945' and vencimiento = '2026-09-23T00:00:00.000Z'; -- STLP29: 22-sep → 1-oct (Woo)
update clientes set fecha_contratacion = '2026-08-31T13:01:17.562Z', vencimiento = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878208242' and vencimiento = '2026-09-23T21:02:31.999Z'; -- LBHR45: 23-sep → 30-sep (Oneclick)
update clientes set fecha_contratacion = '2026-08-26T17:58:40.300Z', vencimiento = ('2026-09-25 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878211609' and vencimiento = '2026-09-19T17:21:06.000Z'; -- VVYX49: 19-sep → 25-sep
update clientes set fecha_contratacion = '2026-09-07T18:32:05.000Z', vencimiento = ('2026-10-06 12:00'::timestamp at time zone 'America/Santiago') where id = 'c1783379878205118' and vencimiento = '2026-09-30T00:00:00.000Z'; -- LTLZ62: 29-sep → 6-oct (Woo)
update suscripciones_oneclick set proximo_cobro = ('2026-09-30 12:00'::timestamp at time zone 'America/Santiago'), actualizado_en = now() where patente = 'LBHR45' and estado = 'activa'; -- 23-sep → 30-sep
*/
