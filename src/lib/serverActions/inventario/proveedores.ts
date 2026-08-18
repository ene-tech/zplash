"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { Proveedor } from "@/types";

// El directorio de proveedores se administra desde dos módulos —
// Inventario → Proveedores y Contabilidad → Proveedores (es el mismo
// ProveedoresTab)— así que basta con tener uno de los dos: exigir solo
// "inventario" hacía que un perfil de contabilidad guardara y el commit
// fallara en silencio como "sin conexión".
async function puedeEditarProveedores(): Promise<boolean> {
  return (await tieneModulo("inventario")) || (await tieneModulo("contabilidad"));
}

export async function upsertProveedores(rows: Proveedor[]): Promise<boolean> {
  if (!(await puedeEditarProveedores())) return false;
  return dataAccess.upsertProveedores(rows);
}

export async function deleteProveedores(ids: string[]): Promise<boolean> {
  if (!(await puedeEditarProveedores())) return false;
  return dataAccess.deleteProveedores(ids);
}
