import type { AppData, Empresa } from "@/types";
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
