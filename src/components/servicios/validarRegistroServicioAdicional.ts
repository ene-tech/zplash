import { validarDisponibilidad } from "@/lib/agenda";
import { RUT_FORMATO_MSG, TELEFONO_FORMATO_MSG, fmtCLP, formatRut, isValidEmail, isValidRut, isValidTelefono } from "@/lib/helpers";
import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";

export type EstadoPagoServicioAdicional = "pagado" | "abono50";
export type MetodoPagoServicioAdicional = "efectivo" | "tarjeta" | "transferencia";

export interface DatosValidacionServicioAdicional {
  lineasCount: number;
  hayDetailingSeleccionado: boolean;
  tamanoElegido: boolean;
  nombre: string;
  telefonoValor: string;
  emailValor: string;
  vehiculoValor: string;
  estadoPago: EstadoPagoServicioAdicional | null;
  montoAbono: number;
  montoAbonoMinimo: number;
  totalListado: number;
  metodoPago: MetodoPagoServicioAdicional | null;
  horarioConfigurado: boolean;
  horaCita: string;
  fechaCita: string;
  duracionCita: number;
  horariosAgenda: HorarioAgenda[];
  bloqueosAgenda: BloqueoAgenda[];
  citasDelDiaCita: Cita[];
  tipoDoc: "Boleta" | "Factura";
  razonSocialValor: string;
  rutRawValor: string;
  direccionValor: string;
  giroValor: string;
}

export type ResultadoValidacionServicioAdicional = { ok: false; error: string } | { ok: true; rut: string };

// Valida y normaliza el formulario de "Registrar servicio adicional" antes de
// armar Cliente/Venta/Cita (ver registrarServicioAdicional en @/lib/logic):
// devuelve el primer error encontrado, en el mismo orden que antes tenía
// registrar() en useServiciosAdicionalesForm, o el RUT ya formateado si todo
// pasa (único dato derivado que el caller necesita de vuelta).
export function validarRegistroServicioAdicional(d: DatosValidacionServicioAdicional): ResultadoValidacionServicioAdicional {
  if (d.lineasCount === 0) return { ok: false, error: "Selecciona al menos un servicio" };
  if (d.hayDetailingSeleccionado && !d.tamanoElegido) {
    return { ok: false, error: "Selecciona el tamaño del vehículo para el Lavado Completo Detailing" };
  }
  if (!d.nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (!d.telefonoValor) return { ok: false, error: "El teléfono es obligatorio" };
  if (!isValidTelefono(d.telefonoValor)) return { ok: false, error: TELEFONO_FORMATO_MSG };
  if (!d.emailValor) return { ok: false, error: "El correo electrónico es obligatorio" };
  if (!isValidEmail(d.emailValor)) return { ok: false, error: "El correo electrónico no es válido" };
  if (!d.vehiculoValor) return { ok: false, error: "El vehículo es obligatorio" };
  if (!d.estadoPago) return { ok: false, error: "Indica si el servicio está pagado 100% o con abono" };
  if (d.estadoPago === "abono50") {
    if (!d.montoAbono || d.montoAbono < d.montoAbonoMinimo) {
      return { ok: false, error: `El abono debe ser como mínimo ${fmtCLP(d.montoAbonoMinimo)} (50% del total)` };
    }
    if (d.montoAbono > d.totalListado) return { ok: false, error: "El abono no puede superar el total del servicio" };
  }
  if (!d.metodoPago) return { ok: false, error: "Selecciona efectivo, tarjeta o transferencia" };
  if (d.horarioConfigurado && !d.horaCita) return { ok: false, error: "Selecciona una hora de inicio para el servicio" };
  if (d.horaCita && d.horarioConfigurado) {
    const motivo = validarDisponibilidad(d.fechaCita, d.horaCita, d.duracionCita, d.horariosAgenda, d.bloqueosAgenda, d.citasDelDiaCita);
    if (motivo) return { ok: false, error: motivo };
  }
  if (d.tipoDoc === "Factura") {
    if (!d.razonSocialValor || !d.direccionValor || !d.giroValor) {
      return { ok: false, error: "Completa Razón Social, Dirección y Giro para la factura" };
    }
    if (!isValidRut(d.rutRawValor)) return { ok: false, error: RUT_FORMATO_MSG };
  }
  return { ok: true, rut: d.tipoDoc === "Factura" ? formatRut(d.rutRawValor) : "" };
}
