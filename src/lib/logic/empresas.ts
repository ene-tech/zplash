import type { AppData, Cliente, Empresa, Venta } from "@/types";
import { formatRut, uid } from "@/lib/helpers";

// Backfill para clientes con Factura que quedaron sin su Empresa (p. ej. los
// que importarClientes creó antes de que sincronizara Empresas, o cualquier
// otro origen histórico): junta un cliente por RUT único que no esté ya en
// Empresas y lo da de alta ahí, con ese cliente como contacto. No toca
// clientes ni borra nada — solo agrega filas nuevas a Empresas.
export function empresasFaltantesDesdeClientes(data: AppData): Empresa[] {
  const rutsEmpresa = new Set(data.empresas.map((e) => formatRut(e.rut)));
  const nuevas: Empresa[] = [];
  for (const c of data.clientes) {
    if (c.tipoDocumento !== "Factura" || !c.rut) continue;
    const rut = formatRut(c.rut);
    if (rutsEmpresa.has(rut)) continue;
    rutsEmpresa.add(rut);
    nuevas.push({
      id: uid(),
      razonSocial: c.razonSocial || c.nombre,
      rut,
      giro: c.giro,
      direccion: c.direccion,
      telefono: c.telefono,
      contactoClienteId: c.id,
      contactoNombre: c.nombre,
      creadoEn: new Date().toISOString(),
      creadoPor: "Sincronización (clientes con Factura)",
    });
  }
  return nuevas;
}

export interface FacturaEmpresa {
  folio?: number;
  fecha: string;
  total: number;
  ventas: Venta[];
}

export interface FacturaEmitida extends FacturaEmpresa {
  /** RUT formateado; vacío si la venta no lo trae ni el cliente lo tiene. */
  rut: string;
  razonSocial: string;
}

// Todas las facturas emitidas, más nueva primero. El RUT y la razón social
// salen de la venta (compra web) o, si no traen, de la ficha del cliente: el
// mismo criterio que usa emitirFacturaVentas. Las ventas con folio se agrupan
// en una factura; las marcadas a mano (sin folio) quedan una por venta.
export function facturasEmitidas(ventas: Venta[], clientes: Cliente[]): FacturaEmitida[] {
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const porFolio = new Map<string, FacturaEmitida>();
  for (const v of ventas) {
    if (!v.facturaEmitida) continue;
    const key = v.facturaFolio ? `f${v.facturaFolio}` : `v${v.id}`;
    let f = porFolio.get(key);
    if (!f) {
      const cliente = clientePorId.get(v.clienteId);
      const rut = v.rut || cliente?.rut;
      f = { folio: v.facturaFolio, fecha: v.fecha, total: 0, ventas: [], rut: rut ? formatRut(rut) : "", razonSocial: v.razonSocial || cliente?.razonSocial || "" };
      porFolio.set(key, f);
    }
    f.total += v.precio || 0;
    f.ventas.push(v);
    if (v.fecha > f.fecha) f.fecha = v.fecha;
  }
  return [...porFolio.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Facturas emitidas a una empresa (ver facturasEmitidas).
export function facturasDeEmpresa(empresa: Empresa, ventas: Venta[], clientes: Cliente[]): FacturaEmpresa[] {
  const rut = formatRut(empresa.rut);
  return facturasEmitidas(ventas, clientes).filter((f) => f.rut && f.rut === rut);
}
