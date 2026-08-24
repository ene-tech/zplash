import type { AppData, Empresa } from "@/types";
import { PLANES, formatRut, formatTelefono, isValidPatente, isValidRut, normPlate, uid, vencimientoPorDefectoISO } from "@/lib/helpers";

function getField(row: Record<string, unknown>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((k) => k.trim().toLowerCase() === n);
    if (k !== undefined && row[k] !== "") return String(row[k]);
  }
  return "";
}

function parseFecha(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const d = new Date(v as string);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

export interface ImportResult {
  patch: Partial<AppData>;
  nuevos: number;
  actualizados: number;
  errores: number[];
}

export function importarClientes(data: AppData, rows: Record<string, unknown>[]): ImportResult {
  let nuevos = 0;
  let actualizados = 0;
  const errores: number[] = [];
  const clientes = [...data.clientes];
  // El RUT manda (mismo criterio que ClientModal/ServiciosAdicionalesView/
  // VentaEmpresaTab): si una fila trae Factura con un RUT que no está en
  // Empresas, se da de alta ahí también, para que no queden facturables
  // "huérfanos" que solo existen en clientes.
  const rutsEmpresa = new Set(data.empresas.map((e) => formatRut(e.rut)));
  const nuevasEmpresas: Empresa[] = [];

  rows.forEach((row, idx) => {
    const patenteRaw = getField(row, "patente", "placa", "placa patente");
    const patente = normPlate(patenteRaw);
    if (!isValidPatente(patente)) {
      errores.push(idx + 2);
      return;
    }
    const nombre = getField(row, "nombre", "cliente").toUpperCase();
    if (!nombre) {
      errores.push(idx + 2);
      return;
    }
    const telefono = formatTelefono(getField(row, "telefono", "teléfono", "fono"));
    const email = getField(row, "email", "correo", "correo electronico", "correo electrónico");
    const vehiculo = getField(row, "vehiculo", "vehículo", "auto");
    const plan = PLANES[0];
    const fechaContratacion = parseFecha(
      getField(row, "fecha contratacion", "fecha de contratacion", "fecha contratación", "fecha de contratación", "contratacion")
    );
    let vencimiento: string | null = null;
    if (fechaContratacion) {
      vencimiento = vencimientoPorDefectoISO(new Date(fechaContratacion));
    }
    const tipoDocRaw = getField(row, "tipo documento", "tipodocumento", "documento");
    const tipoDocumento: "Boleta" | "Factura" = tipoDocRaw && tipoDocRaw.toLowerCase().startsWith("fact") ? "Factura" : "Boleta";
    const razonSocialRaw = tipoDocumento === "Factura" ? getField(row, "razon social", "razón social") : "";
    const rutRaw = tipoDocumento === "Factura" ? getField(row, "rut") : "";
    const direccionRaw = tipoDocumento === "Factura" ? getField(row, "direccion", "dirección") : "";
    const giroRaw = tipoDocumento === "Factura" ? getField(row, "giro") : "";
    // Mismo criterio que ClientModal.guardar(): si la fila viene como
    // Factura, Razón Social/RUT/Dirección/Giro no son opcionales — sin esto
    // se colaban clientes "Factura" sin datos de facturación, que después
    // rebotaban al intentar emitir el documento.
    if (tipoDocumento === "Factura" && (!razonSocialRaw || !direccionRaw || !giroRaw || !isValidRut(rutRaw))) {
      errores.push(idx + 2);
      return;
    }
    const razonSocial = razonSocialRaw;
    const rut = tipoDocumento === "Factura" ? formatRut(rutRaw) : "";
    const direccion = direccionRaw;
    const giro = giroRaw;
    const origenRaw = getField(row, "origen", "canal");
    const origen: "WEB" | "LOCAL" = origenRaw.toLowerCase().startsWith("web") ? "WEB" : "LOCAL";

    const existenteIdx = clientes.findIndex((c) => normPlate(c.patente) === patente);
    let clienteId: string;
    if (existenteIdx !== -1) {
      const existente = clientes[existenteIdx];
      clienteId = existente.id;
      clientes[existenteIdx] = {
        ...existente,
        nombre,
        telefono,
        email,
        vehiculo,
        plan,
        tipoDocumento,
        razonSocial,
        rut,
        direccion,
        giro,
        fechaContratacion: fechaContratacion || existente.fechaContratacion,
        vencimiento: vencimiento || existente.vencimiento,
        origen: origenRaw ? origen : existente.origen,
      };
      actualizados++;
    } else {
      clienteId = uid();
      clientes.push({
        id: clienteId,
        nombre,
        patente,
        telefono,
        email,
        vehiculo,
        plan,
        tipoDocumento,
        razonSocial,
        rut,
        direccion,
        giro,
        fechaContratacion,
        vencimiento,
        origen,
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: "Carga masiva (Excel)",
      });
      nuevos++;
    }

    if (tipoDocumento === "Factura" && rut && !rutsEmpresa.has(rut)) {
      rutsEmpresa.add(rut);
      nuevasEmpresas.push({
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: clienteId,
        contactoNombre: nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: "Carga masiva (Excel)",
      });
    }
  });

  return {
    patch: { clientes, ...(nuevasEmpresas.length ? { empresas: [...data.empresas, ...nuevasEmpresas] } : {}) },
    nuevos,
    actualizados,
    errores,
  };
}
