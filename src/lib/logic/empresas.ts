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

// Facturas emitidas a una empresa, más nueva primero. El RUT sale de la venta
// (compra web) o, si no trae, de la ficha del cliente: el mismo criterio que
// usa emitirFacturaVentas. Las ventas con folio se agrupan en una factura; las
// marcadas a mano (sin folio) quedan una por venta.
export function facturasDeEmpresa(empresa: Empresa, ventas: Venta[], clientes: Cliente[]): FacturaEmpresa[] {
  const rut = formatRut(empresa.rut);
  const rutCliente = new Map(clientes.map((c) => [c.id, c.rut]));
  const porFolio = new Map<string, FacturaEmpresa>();
  for (const v of ventas) {
    if (!v.facturaEmitida) continue;
    const rutVenta = v.rut || rutCliente.get(v.clienteId);
    if (!rutVenta || formatRut(rutVenta) !== rut) continue;
    const key = v.facturaFolio ? `f${v.facturaFolio}` : `v${v.id}`;
    const f = porFolio.get(key) || { folio: v.facturaFolio, fecha: v.fecha, total: 0, ventas: [] };
    f.total += v.precio || 0;
    f.ventas.push(v);
    if (v.fecha > f.fecha) f.fecha = v.fecha;
    porFolio.set(key, f);
  }
  return [...porFolio.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}
