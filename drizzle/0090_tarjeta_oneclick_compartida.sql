-- Una misma tarjeta inscrita puede cobrar varias patentes de la misma
-- persona. Hasta acá `username` era único porque valía la patente y había
-- exactamente una inscripción por auto: el cliente con 3 autos tenía que
-- pasar 3 veces por Transbank con la misma tarjeta.
--
-- Ahora la fila sigue siendo "el ciclo de cobro de esta patente" (cada auto
-- conserva su propio vencimiento, estado y proximoCobro), pero varias filas
-- pueden compartir el par (username, tbk_user) que identifica la tarjeta en
-- Transbank — ver "Usar en mis otros autos" en Mi Cuenta
-- (/api/cliente/mi-cuenta/compartir-tarjeta). authorize() acepta el mismo
-- tbkUser para cobros distintos, así que no hay nada que cambiar del lado de
-- Transbank.
--
-- OJO al dar de baja: cancelarSuscripcionOneclick ahora solo llama al delete
-- de Transbank cuando es la última fila viva con ese tbk_user, si no dejaría
-- sin tarjeta a los otros autos.
ALTER TABLE "suscripciones_oneclick" DROP CONSTRAINT IF EXISTS "suscripciones_oneclick_username_unique";

-- Sigue habiendo una sola fila por patente (lo que el upsert de /inscribir
-- da por sentado), y eso antes lo garantizaba de rebote el unique de arriba.
CREATE UNIQUE INDEX IF NOT EXISTS "suscripciones_oneclick_patente_unique" ON "suscripciones_oneclick" ("patente");
