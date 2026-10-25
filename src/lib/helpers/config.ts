import type { ConfigGlobal } from "@/types";
import { esFinDeSemanaOFestivo } from "./fechas";
import { TEXTOS_BOT_WHATSAPP_DEFAULT } from "./whatsapp";

/** Semilla/fallback de horario del módulo Operador (ver ConfigGlobal) para
 * cuando la tabla `config` todavía no tiene los nuevos campos guardados —
 * mismo patrón que PRECIOS_DEFAULT/SERVICIOS_DEFAULT. */
export const CONFIG_DEFAULT: ConfigGlobal = {
  horarioOperadorSemanaInicio: "08:25",
  horarioOperadorSemanaFin: "20:15",
  horarioOperadorFindeInicio: "09:55",
  horarioOperadorFindeFin: "19:15",
  festivos: [],
  dotacion: [],
  partTimes: [],
  planillaPartTime: [],
  vigenciaDiasPackEmpresa: 365,
  tramosRenovacionLocal: {},
  horasVentanaUpgradePlan: 1,
  tramosReactivacionVencido: {},
  diasGraciaPagoAtrasado: 4,
  horasBloqueoReingresoPlan: 24.5,
  descuentoPrimeraVezValor: 1000,
  descuentoPrimeraVezDiasValidez: 7,
  descuentoReferidoValor: 2000,
  descuentoReferidoDiasValidez: 30,
  textosBotWhatsapp: TEXTOS_BOT_WHATSAPP_DEFAULT,
  firmaCorreo: "",
  radioAsistenciaMetros: 150,
  agendaDescuentoCombinadoPct: 20,
  agendaTopeMinutos: 0,
};

/** true si `ahora` cae dentro del horario configurado para registrar ingresos en el
 * módulo Operador: Lunes a Viernes usa el rango "semana", Sábado/Domingo/festivos usa
 * el rango "finde" (ver ConfigGlobal, configurable en Administrador de Ingresos → Config). */
export function dentroDeHorarioOperador(config: ConfigGlobal, ahora: Date): boolean {
  const horaActual = hhmm(ahora);
  return horaActual >= inicioHorarioOperador(config, ahora) && horaActual <= finHorarioOperador(config, ahora);
}

function inicioHorarioOperador(config: ConfigGlobal, ahora: Date): string {
  return esFinDeSemanaOFestivo(ahora, config.festivos) ? config.horarioOperadorFindeInicio : config.horarioOperadorSemanaInicio;
}

/** Hora ("HH:MM") en que termina el horario de funcionamiento del día de `ahora`. */
export function finHorarioOperador(config: ConfigGlobal, ahora: Date): string {
  return esFinDeSemanaOFestivo(ahora, config.festivos) ? config.horarioOperadorFindeFin : config.horarioOperadorSemanaFin;
}

/** true si ya se puede cerrar la caja del día de hoy: solo una vez terminado
 * el horario de funcionamiento. Antes de la apertura tampoco — cerrar a las
 * 7:00 dejaría bloqueado todo el día que viene. `ahora` en hora de Chile (ver
 * ahoraEnSantiago). Un día pasado siempre se puede cerrar: no pasa por acá. */
export function puedeCerrarCajaDeHoy(config: ConfigGlobal, ahora: Date): boolean {
  return hhmm(ahora) > finHorarioOperador(config, ahora);
}

function hhmm(d: Date): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
