-- Prende las reglas de WhatsApp de confirmación (paso 1 de 2).
--
-- DÓNDE: Supabase → SQL Editor (las migraciones de drizzle están
-- desincronizadas, el SQL de este proyecto se aplica a mano).
--
-- QUÉ HACE: pone `activa = true` en las 6 reglas transaccionales — las que
-- confirman algo que el cliente acaba de hacer o que le pasó a su plan. Desde
-- que se guarde, cada venta de ese tipo dispara un WhatsApp automático.
--
-- POR QUÉ ESTAS 6 Y NO LAS 8: las otras dos van aparte.
--   · "Recordatorio renovación próxima" tiene su propio archivo, porque la
--     primera corrida manda 136 mensajes de una (ver
--     prender-regla-whatsapp-recordatorio-vencimiento.sql).
--   · "Confirmación compra lavado unico + promo contrata tu plan" queda
--     APAGADA a propósito: son 1.663 ventas en 30 días (~55 mensajes al día)
--     con una plantilla que Meta tiene categorizada como MARKETING, y sin
--     tope de frecuencia — quien lava 3 veces por semana recibiría 12
--     mensajes promocionales al mes. Eso hunde la calificación de calidad del
--     número en Meta, que es lo que sostiene TODO el canal saliente.
--
-- VOLUMEN QUE ENCIENDE: ~500 mensajes en 30 días (~17 al día), medido sobre
-- las ventas de los últimos 30 días que tienen cliente con teléfono.
--   Plan nuevo 259 · Renovación (Web) 151 · Reactivación promocional 35
--   Renovación automática (Oneclick) 29 · Renovación preferencial 25
--   · "Problema al cobrar tu plan" va por cobro rechazado, no por venta.
--
-- QUÉ RESPONDE: "UPDATE 6". Si dice otro número, alguna regla cambió de
-- nombre — revisar antes de seguir, no reintentar.
--
-- QUÉ NO TOCA: no cambia plantillas, ni textos, ni el bot que contesta los
-- mensajes entrantes. No manda nada retroactivo: `disparos_regla_whatsapp`
-- solo se llena hacia adelante, así que las ventas viejas no reciben nada.
--
-- CÓMO SE APAGA: el mismo update con `activa = false`.

update reglas_whatsapp
set activa = true
where nombre in (
  'Confirmación contratación de plan',
  'Confirmación de renovación',
  'Confirmación de renovación (Web)',
  'Reactivación de plan vencido',
  'Renovación automática exitosa (Oneclick)',
  'Problema al cobrar tu plan'
);
