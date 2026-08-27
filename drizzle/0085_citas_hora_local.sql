-- Corrige las citas guardadas con la hora local mandada sin zona horaria a
-- una columna timestamptz: Postgres las leyó como UTC, así que en la Agenda
-- aparecían 4 h antes de la hora que eligió el operador (ver el comentario en
-- registrarServicioAdicional, @/lib/logic/serviciosAdicionales.ts, donde se
-- arregló el origen). Reinterpretar el valor naive en America/Santiago
-- devuelve el instante real y respeta el cambio de horario de verano.
--
-- Se saltan las citas sin hora elegida: ésas ya se guardaron con
-- new Date().toISOString() (instante correcto) y quedan a menos de 5 s de su
-- creación. El corte por creado_en acota la corrida a lo escrito antes del
-- arreglo, para que reaplicar este archivo no toque filas nuevas ya sanas.
UPDATE "citas"
SET "fecha_hora" = ("fecha_hora" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago'
WHERE "creado_en" < TIMESTAMPTZ '2026-08-27 00:00:00-04'
  AND ABS(EXTRACT(EPOCH FROM ("creado_en" - "fecha_hora"))) >= 5;
