import {
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidRut,
  isValidTelefono,
} from "@/lib/helpers";

export interface DatosValidacionQuickAdd {
  nombreRaw: string;
  telefonoRaw: string;
  emailRaw: string;
  exentoValidacion: boolean;
  tipoDocumento: "Boleta" | "Factura";
  razonSocialRaw: string;
  rutRaw: string;
  direccionRaw: string;
  giroRaw: string;
}

export type ResultadoValidacionQuickAdd =
  | { ok: false; error: string }
  | { ok: true; nombre: string; telefono: string; email: string; razonSocial: string; rut: string; direccion: string; giro: string };

// Valida y normaliza el registro rápido de cliente nuevo desde "patente no
// registrada" (ver prepararClienteRapido en @/lib/logic), en el mismo orden
// que antes tenía quickAdd() en useOperadorNotFoundResult. Nombre y Teléfono
// son los únicos campos obligatorios (el email queda opcional salvo para
// Factura); la validación de email para Factura es incondicional (no exime
// ni siquiera a un perfil exentoValidacion): sin correo válido no hay a
// quién facturarle.
export function validarQuickAddCliente(d: DatosValidacionQuickAdd): ResultadoValidacionQuickAdd {
  const nombre = d.nombreRaw.trim().toUpperCase();
  const telefonoRaw = d.telefonoRaw.trim();
  const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
  const email = d.emailRaw.trim();
  if (!nombre || (!d.exentoValidacion && !telefonoRaw)) {
    return { ok: false, error: "Completa Nombre y Teléfono para registrar al cliente" };
  }
  if (!d.exentoValidacion && !isValidTelefono(telefono)) return { ok: false, error: TELEFONO_FORMATO_MSG };
  if (email && !isValidEmail(email)) return { ok: false, error: "Ingresa un email válido" };

  const razonSocial = d.tipoDocumento === "Factura" ? d.razonSocialRaw.trim() : "";
  const rutRaw = d.tipoDocumento === "Factura" ? d.rutRaw.trim() : "";
  const direccion = d.tipoDocumento === "Factura" ? d.direccionRaw.trim() : "";
  const giro = d.tipoDocumento === "Factura" ? d.giroRaw.trim() : "";
  if (d.tipoDocumento === "Factura") {
    if (!email || !isValidEmail(email)) return { ok: false, error: "Ingresa un email válido para la factura" };
    if (!razonSocial || !direccion || !giro) return { ok: false, error: "Completa Razón Social, Dirección y Giro para la factura" };
    if (!isValidRut(rutRaw)) return { ok: false, error: RUT_FORMATO_MSG };
  }
  const rut = d.tipoDocumento === "Factura" ? formatRut(rutRaw) : "";

  return { ok: true, nombre, telefono, email, razonSocial, rut, direccion, giro };
}
