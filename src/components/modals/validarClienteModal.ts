import {
  PATENTE_FORMATO_MSG,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  normPlate,
} from "@/lib/helpers";
import type { Cliente } from "@/types";

export interface DatosValidacionClienteModal {
  nombreRaw: string;
  patenteRaw: string;
  telefonoRaw: string;
  vehiculoRaw: string;
  emailRaw: string;
  tipoDocumento: "Boleta" | "Factura";
  razonSocialRaw: string;
  rutRaw: string;
  direccionRaw: string;
  giroRaw: string;
  exentoFormato: boolean;
  clientes: Cliente[];
  clienteIdActual: string | undefined;
}

export type ResultadoValidacionClienteModal =
  | { ok: false; error: string }
  | {
      ok: true;
      nombre: string;
      patente: string;
      telefono: string;
      email: string;
      vehiculo: string;
      razonSocial: string;
      rut: string;
      direccion: string;
      giro: string;
    };

// Valida y normaliza el formulario de alta/edición de cliente (ver
// guardarClienteModal en @/lib/logic), en el mismo orden que antes tenía
// guardar() en useClientModal.
export function validarClienteModal(d: DatosValidacionClienteModal): ResultadoValidacionClienteModal {
  const nombre = d.nombreRaw.trim().toUpperCase();
  const patente = normPlate(d.patenteRaw);
  if (!nombre || !patente) return { ok: false, error: "Nombre y patente son obligatorios" };
  if (!d.exentoFormato && !isValidPatente(patente)) return { ok: false, error: PATENTE_FORMATO_MSG };
  const dup = d.clientes.find((x) => normPlate(x.patente) === patente && x.id !== d.clienteIdActual);
  if (dup) return { ok: false, error: "Ya existe un cliente con esa patente" };

  const telefonoRaw = d.telefonoRaw.trim();
  // El campo precarga "+569" como ayuda para tipear solo los 8 dígitos
  // restantes (ver defaultValue en el input); si el operador lo deja intacto
  // porque el cliente no tiene teléfono, no hay dígitos que validar — sin
  // este chequeo, formatTelefono("+569") devuelve "+569" tal cual (no matchea
  // ningún caso de conversión) e isValidTelefono lo rechaza por formato,
  // bloqueando el guardado de un cliente que en realidad no quiso ingresar
  // teléfono.
  const telefono = telefonoRaw && telefonoRaw !== "+569" ? formatTelefono(telefonoRaw) : "";
  if (!d.exentoFormato && telefono && !isValidTelefono(telefono)) return { ok: false, error: TELEFONO_FORMATO_MSG };

  const email = d.emailRaw.trim();
  const vehiculo = d.vehiculoRaw.trim();
  const razonSocial = d.tipoDocumento === "Factura" ? d.razonSocialRaw.trim() : "";
  const rutRawTrim = d.tipoDocumento === "Factura" ? d.rutRaw.trim() : "";
  const direccion = d.tipoDocumento === "Factura" ? d.direccionRaw.trim() : "";
  const giro = d.tipoDocumento === "Factura" ? d.giroRaw.trim() : "";
  if (d.tipoDocumento === "Factura" && !d.exentoFormato) {
    if (!email || !isValidEmail(email)) return { ok: false, error: "Ingresa un email válido para la factura" };
    if (!razonSocial || !direccion || !giro) return { ok: false, error: "Completa Razón Social, Dirección y Giro para la factura" };
    if (!isValidRut(rutRawTrim)) return { ok: false, error: RUT_FORMATO_MSG };
  }
  const rut = d.tipoDocumento === "Factura" ? formatRut(rutRawTrim) : "";

  return { ok: true, nombre, patente, telefono, email, vehiculo, razonSocial, rut, direccion, giro };
}
