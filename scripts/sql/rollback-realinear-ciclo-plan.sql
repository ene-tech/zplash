-- Rollback de scripts/sql/realinear-ciclo-plan.sql, generado el 02-09-2026.
-- DÓNDE: Supabase → SQL Editor. Deja a los 51 clientes exactamente como
-- estaban antes del realineo (incluido el vencimiento viejo de RBBP85).

update clientes set fecha_contratacion = '2026-07-05T22:57:00.000Z', vencimiento = '2026-09-16T03:00:00.000Z' where id = 'c1783380142934278'; -- BLCR82
update clientes set fecha_contratacion = '2026-06-30T18:25:46.000Z', vencimiento = '2026-09-09T19:49:50.653Z' where id = 'c1783379878206606'; -- DCYX66
update clientes set fecha_contratacion = '2026-06-27T00:52:52.999Z', vencimiento = '2026-09-10T14:56:34.000Z' where id = 'c1783379878207640'; -- FRVV32
update clientes set fecha_contratacion = '2026-06-26T19:44:37.999Z', vencimiento = '2026-09-10T14:04:01.839Z' where id = 'c1783379878207134'; -- HBSL75
update clientes set fecha_contratacion = '2026-06-24T04:16:03.000Z', vencimiento = '2026-09-26T03:00:00.000Z' where id = 'c178337987820862'; -- HPWK75
update clientes set fecha_contratacion = '2026-05-27T14:16:18.000Z', vencimiento = '2026-09-11T18:43:00.041Z' where id = 'c178361915734849'; -- HSRP79
update clientes set fecha_contratacion = '2026-07-22T20:10:29.000Z', vencimiento = '2026-09-29T03:00:00.000Z' where id = 'c17847512192701'; -- HVJP79
update clientes set fecha_contratacion = '2026-06-21T03:02:34.999Z', vencimiento = '2026-09-29T03:00:00.000Z' where id = 'c1783379878211890'; -- JBVH39
update clientes set fecha_contratacion = '2026-07-06T16:13:00.000Z', vencimiento = '2026-09-11T20:21:56.841Z' where id = 'c1783380142935874'; -- JTSP26
update clientes set fecha_contratacion = '2026-05-24T22:01:52.000Z', vencimiento = '2026-09-12T16:42:18.986Z' where id = 'c1784047147156942'; -- JZYW32
update clientes set fecha_contratacion = '2026-06-25T15:41:00.000Z', vencimiento = '2026-09-09T20:13:46.779Z' where id = 'c1783380142930792'; -- KBYJ50
update clientes set fecha_contratacion = '2026-06-18T22:37:11.999Z', vencimiento = '2026-09-29T03:00:00.000Z' where id = 'c1783379878211645'; -- KCXV54
update clientes set fecha_contratacion = '2026-04-06T17:58:01.000Z', vencimiento = '2026-09-12T12:27:39.202Z' where id = 'c-wc-4883'; -- LFYV21
update clientes set fecha_contratacion = '2026-06-27T00:52:43.999Z', vencimiento = '2026-09-29T03:00:00.000Z' where id = 'c1783379878207956'; -- LHDT37
update clientes set fecha_contratacion = '2026-06-18T00:58:41.000Z', vencimiento = '2026-09-22T03:00:00.000Z' where id = 'c1783379878211359'; -- LRRL43
update clientes set fecha_contratacion = '2026-06-22T18:46:00.000Z', vencimiento = '2026-09-28T16:26:11.490Z' where id = 'c1783380142929215'; -- PCSK54
update clientes set fecha_contratacion = '2026-06-25T16:08:00.000Z', vencimiento = '2026-09-07T15:09:57.606Z' where id = 'c178338014293066'; -- PDRD64
update clientes set fecha_contratacion = '2026-06-22T14:43:00.000Z', vencimiento = '2026-09-10T17:11:52.824Z' where id = 'c178338014292824'; -- PGYW91
update clientes set fecha_contratacion = '2026-04-01T18:19:57.000Z', vencimiento = '2026-09-17T19:55:13.228Z' where id = 'c-wc-4691'; -- PLRT81
update clientes set fecha_contratacion = '2026-06-13T21:51:21.999Z', vencimiento = '2026-09-21T13:05:05.437Z' where id = 'c1783379878213787'; -- PSTZ11
update clientes set fecha_contratacion = '2026-06-27T16:44:00.000Z', vencimiento = '2026-09-07T20:02:30.843Z' where id = 'c178338014293177'; -- PXTL97
update clientes set fecha_contratacion = '2026-06-07T22:48:09.000Z', vencimiento = '2026-09-05T22:48:09.000Z' where id = 'c1783379878215749'; -- RBBP85 (vencimiento original, previo al paso 1)
update clientes set fecha_contratacion = '2026-06-26T19:37:00.000Z', vencimiento = '2026-09-06T18:18:28.763Z' where id = 'c1783380142930732'; -- RBHL54
update clientes set fecha_contratacion = '2026-06-30T07:58:11.999Z', vencimiento = '2026-09-17T20:00:15.353Z' where id = 'c1783379878206219'; -- RFCY64
update clientes set fecha_contratacion = '2026-06-27T22:14:50.000Z', vencimiento = '2026-09-10T20:20:14.055Z' where id = 'c178337987820783'; -- RHJG76
update clientes set fecha_contratacion = '2026-06-27T22:37:00.000Z', vencimiento = '2026-09-05T15:08:43.012Z' where id = 'c1783380142931667'; -- RHRH53
update clientes set fecha_contratacion = '2026-06-26T19:52:00.000Z', vencimiento = '2026-09-30T20:10:27.589Z' where id = 'c1783380142930236-dup7'; -- RSPR47
update clientes set fecha_contratacion = '2026-06-28T15:30:34.000Z', vencimiento = '2026-09-12T15:30:18.000Z' where id = 'c1783956604897830'; -- RYGZ47
update clientes set fecha_contratacion = '2026-06-27T16:36:00.000Z', vencimiento = '2026-09-13T12:22:01.767Z' where id = 'c1783380142931153'; -- RYJR55
update clientes set fecha_contratacion = '2026-06-28T21:25:19.000Z', vencimiento = '2026-09-16T04:10:58.716Z' where id = 'c1783379878207161'; -- RYLD66
update clientes set fecha_contratacion = '2026-06-25T21:23:00.999Z', vencimiento = '2026-09-28T03:00:00.000Z' where id = 'c1783379878208450'; -- SFPY58
update clientes set fecha_contratacion = '2026-06-24T21:53:00.000Z', vencimiento = '2026-09-08T17:37:05.278Z' where id = 'c1783380142929527'; -- SJXR98
update clientes set fecha_contratacion = '2025-08-30T22:22:10.000Z', vencimiento = '2026-09-18T19:04:25.280Z' where id = 'c-wc-3881'; -- SSRR47
update clientes set fecha_contratacion = '2026-06-25T23:59:23.999Z', vencimiento = '2026-09-08T19:19:28.000Z' where id = 'c1783379878208209'; -- SVKR55
update clientes set fecha_contratacion = '2026-06-24T22:47:04.000Z', vencimiento = '2026-09-26T03:00:00.000Z' where id = 'c1783379878208300'; -- SXTF96
update clientes set fecha_contratacion = '2026-06-20T18:21:00.999Z', vencimiento = '2026-09-26T03:00:00.000Z' where id = 'c1783379878211605'; -- TDBX64
update clientes set fecha_contratacion = '2026-06-19T15:35:00.000Z', vencimiento = '2026-09-09T19:11:55.951Z' where id = 'c1783380142928759'; -- TDBY24
update clientes set fecha_contratacion = '2026-06-24T13:44:00.000Z', vencimiento = '2026-09-08T20:04:53.571Z' where id = 'c1783380142929897'; -- THRP28
update clientes set fecha_contratacion = '2026-06-25T19:16:14.000Z', vencimiento = '2026-09-29T03:00:00.000Z' where id = 'c1783379878208403'; -- TLPG65
update clientes set fecha_contratacion = '2026-06-08T19:54:31.999Z', vencimiento = '2026-09-03T16:16:53.818Z' where id = 'c178337987821586'; -- TVKK59
update clientes set fecha_contratacion = '2026-07-05T18:16:00.000Z', vencimiento = '2026-09-10T14:09:52.455Z' where id = 'c1783380142934907'; -- TYGZ19
update clientes set fecha_contratacion = '2026-06-15T00:00:11.000Z', vencimiento = '2026-09-28T03:00:00.000Z' where id = 'c1783379878212731'; -- VCBF68
update clientes set fecha_contratacion = '2026-06-12T21:51:27.000Z', vencimiento = '2026-09-06T18:22:39.000Z' where id = 'c1783379878213883'; -- VKDF55
update clientes set fecha_contratacion = '2026-06-11T22:24:20.000Z', vencimiento = '2026-09-28T15:09:34.868Z' where id = 'c1783379878213668'; -- VLXL81
update clientes set fecha_contratacion = '2026-06-09T09:14:56.999Z', vencimiento = '2026-09-27T03:00:00.000Z' where id = 'c1783379878214797'; -- VVXY81
update clientes set fecha_contratacion = '2026-06-22T20:29:00.000Z', vencimiento = '2026-09-03T21:14:12.932Z' where id = 'c1783380142929290'; -- VWHZ63
update clientes set fecha_contratacion = '2026-06-25T13:14:00.000Z', vencimiento = '2026-09-07T16:53:49.109Z' where id = 'c1783380142929710'; -- VWHZ93
update clientes set fecha_contratacion = '2026-06-26T19:41:00.000Z', vencimiento = '2026-09-29T13:57:29.849Z' where id = 'c1783380142930202'; -- VWYJ10
update clientes set fecha_contratacion = '2026-06-28T20:40:00.000Z', vencimiento = '2026-09-21T19:18:06.248Z' where id = 'c1783380142931820'; -- VXHW97
update clientes set fecha_contratacion = '2026-06-25T17:01:00.000Z', vencimiento = '2026-09-30T21:32:55.678Z' where id = 'c1783380142930679'; -- VYBP30
-- Rollback del realineo de ciclo (scripts/sql/realinear-ciclo-plan.sql).
-- DÓNDE: Supabase → SQL Editor. Deja a cada cliente exactamente como
-- estaba antes (incluido el vencimiento viejo de RBBP85, 05-09-2026).

update clientes set fecha_contratacion = '2026-06-07T20:54:33.000Z', vencimiento = '2026-09-02T18:22:13.042Z' where id = 'c1783379878215635'; -- RKCJ67
