-- Cobros dobles Woo + Oneclick de octubre 2026 (23-oct-2026).
-- 11 clientes inscribieron Oneclick y su suscripción de WooCommerce no se
-- canceló (cancelar en Woo desde producción no funciona): en octubre Oneclick
-- y Woo cobraron el mismo mes. La venta de Woo quedó marcada "posible
-- duplicado, revisar vencimiento" y NO se sumó al plan.
--
-- Decisión del usuario: no devolver, sino darles el mes que pagaron y que no
-- se les cobre nada hasta que termine. Este SQL:
--  - 9 clientes: vencimiento +1 mes (el mes pagado dos veces) y próximo
--    cobro de Oneclick +1 mes (no se les cobra hasta que se acabe).
--  - PZLW87: su doble de septiembre ya estaba sumado (vence 8-dic); solo se
--    corre su próximo cobro de 8-nov a 8-dic, para que no se cobre antes.
--  - LTLZ62: no se toca. Su doble ya se devolvió el 8-oct y su vencimiento
--    está bien.
-- La suscripción de Woo de los 11 se cancela aparte, con
-- scripts/tmp-woo-cortar-cobros-dobles.mts --aplicar (antes del 2-nov).
-- No toca ventas, cobros ni tarjetas. Seguro de re-pegar: cada fila solo
-- cambia si sigue con el valor de hoy.

-- Respaldo para deshacer.
create table if not exists _backup_cobros_dobles_woo_2026_10_23 as
select c.patente, c.vencimiento, s.id as suscripcion_id, s.proximo_cobro
from clientes c join suscripciones_oneclick s on s.patente = c.patente and s.estado = 'activa'
where c.patente in ('VCRY73','VDVY46','JSPW31','RTSP94','RWLV93','TFKP45','JGRT76','SHTJ53','PZVB27','PZLW87');
alter table _backup_cobros_dobles_woo_2026_10_23 enable row level security;
revoke all on table _backup_cobros_dobles_woo_2026_10_23 from anon, authenticated;

begin;

-- 1) Vencimiento +1 mes (9 clientes). Solo si sigue como hoy.
update clientes c set vencimiento = c.vencimiento + interval '1 month'
from (values
  ('VCRY73', timestamptz '2026-10-28 21:37:59.798+00'),
  ('VDVY46', timestamptz '2026-10-31 17:08:20.799+00'),
  ('JSPW31', timestamptz '2026-11-01 00:00:00+00'),
  ('RTSP94', timestamptz '2026-11-01 16:09:48.741+00'),
  ('RWLV93', timestamptz '2026-11-01 17:53:40.465+00'),
  ('TFKP45', timestamptz '2026-11-01 22:43:07.747+00'),
  ('JGRT76', timestamptz '2026-11-04 00:00:00+00'),
  ('SHTJ53', timestamptz '2026-11-05 00:00:00+00'),
  ('PZVB27', timestamptz '2026-11-08 00:00:00+00')
) as x(patente, venc_hoy)
where c.patente = x.patente and c.vencimiento = x.venc_hoy;

-- 2) Próximo cobro de Oneclick +1 mes (los mismos 9 + PZLW87).
update suscripciones_oneclick s set proximo_cobro = s.proximo_cobro + interval '1 month', actualizado_en = now()
from (values
  ('c1790717301452225', timestamptz '2026-10-28 21:37:59.798+00'),
  ('c17908742658567',   timestamptz '2026-11-01 17:08:18.33+00'),
  ('c1790879065853670', timestamptz '2026-11-01 18:27:03.165+00'),
  ('c1788196229864248', timestamptz '2026-11-02 16:09:47.144+00'),
  ('c1790963499514503', timestamptz '2026-11-02 17:53:39.282+00'),
  ('c1790980776553728', timestamptz '2026-11-02 22:43:06.014+00'),
  ('c1791141547578836', timestamptz '2026-11-04 19:20:44.169+00'),
  ('c1791209906629587', timestamptz '2026-11-05 14:20:18.22+00'),
  ('c1788810831593105', timestamptz '2026-11-08 00:00:00+00'),
  ('c17886638867316',   timestamptz '2026-11-08 00:00:00+00')
) as x(id, prox_hoy)
where s.id = x.id and s.estado = 'activa' and s.proximo_cobro = x.prox_hoy;

commit;

-- 3) Después: vencimiento y próximo cobro nuevos de los 10.
select c.patente, to_char(c.vencimiento at time zone 'America/Santiago', 'DD-MM-YYYY') vence,
       to_char(s.proximo_cobro at time zone 'America/Santiago', 'DD-MM-YYYY') proximo_cobro
from clientes c join suscripciones_oneclick s on s.patente = c.patente and s.estado = 'activa'
where c.patente in ('VCRY73','VDVY46','JSPW31','RTSP94','RWLV93','TFKP45','JGRT76','SHTJ53','PZVB27','PZLW87')
order by s.proximo_cobro;

-- Deshacer:
-- update clientes c set vencimiento = b.vencimiento from _backup_cobros_dobles_woo_2026_10_23 b where c.patente = b.patente;
-- update suscripciones_oneclick s set proximo_cobro = b.proximo_cobro from _backup_cobros_dobles_woo_2026_10_23 b where s.id = b.suscripcion_id;
