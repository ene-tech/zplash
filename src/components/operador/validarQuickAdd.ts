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
  tipoCliente: "plan" | "unico";
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
// son los únicos campos obligatorios en general (el email queda opcional
// salvo para Factura); la validación de email para Factura es incondicional
// (no exime ni siquiera a un perfil exentoValidacion): sin correo válido no
// hay a quién facturarle. Si tipoCliente="plan" (contratación de plan, no
// lavado único), Teléfono y Email son obligatorios sin excepción — ni
// siquiera para un perfil exentoValidacion — porque el email dispara el
// aviso automático de contratación (ver ReglaCorreo tipoEvento="venta_creada"
// en Web Settings → Reglas Correo, que sin cliente.email queda en error, ver
// ejecutarAccionReglaCorreo en @/lib/mailing/reglas/motor.ts).
export function validarQuickAddCliente(d: DatosValidacionQuickAdd): ResultadoValidacionQuickAdd {
  const nombre = d.nombreRaw.trim().toUpperCase();
  const telefonoRaw = d.telefonoRaw.trim();
  const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
  const email = d.emailRaw.trim();
  const requiereTelefono = d.tipoCliente === "plan" || !d.exentoValidacion;
  if (!nombre || (requiereTelefono && !telefonoRaw)) {
    return { ok: false, error: "Completa Nombre y Teléfono para registrar al cliente" };
  }
  if (requiereTelefono && !isValidTelefono(telefono)) return { ok: false, error: TELEFONO_FORMATO_MSG };
  if (d.tipoCliente === "plan" && !isValidEmail(email)) {
    return { ok: false, error: "Ingresa un email válido para contratar el plan (se usa para el aviso de contratación)" };
  }
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
