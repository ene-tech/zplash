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
  vigenciaDiasPackEmpresa: 365,
  tramosRenovacionLocal: {},
  horasVentanaUpgradePlan: 1,
  tramosReactivacionVencido: {},
  horasBloqueoReingresoPlan: 24.5,
  descuentoPrimeraVezValor: 1000,
  descuentoPrimeraVezDiasValidez: 7,
  textosBotWhatsapp: TEXTOS_BOT_WHATSAPP_DEFAULT,
  imagenPreciosWhatsapp: undefined,
  imagenPlanWhatsapp: undefined,
};

/** true si `ahora` cae dentro del horario configurado para registrar ingresos en el
 * módulo Operador: Lunes a Viernes usa el rango "semana", Sábado/Domingo/festivos usa
 * el rango "finde" (ver ConfigGlobal, configurable en Administrador de Ingresos → Config). */
export function dentroDeHorarioOperador(config: ConfigGlobal, ahora: Date): boolean {
  const finde = esFinDeSemanaOFestivo(ahora, config.festivos);
  const inicio = finde ? config.horarioOperadorFindeInicio : config.horarioOperadorSemanaInicio;
  const fin = finde ? config.horarioOperadorFindeFin : config.horarioOperadorSemanaFin;
  const horaActual = String(ahora.getHours()).padStart(2, "0") + ":" + String(ahora.getMinutes()).padStart(2, "0");
  return horaActual >= inicio && horaActual <= fin;
}
