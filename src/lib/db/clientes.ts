"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esExentoFormatoCliente, isValidPatente } from "@/lib/helpers";
import { sesionActual, tieneSesionValida } from "@/lib/session";
import type { Cliente } from "@/types";

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  const sesion = await sesionActual();
  if (!sesion) return false;
  // La UI (ClientModal/BulkModal) ya exige nombre y patente válida antes de
  // llamar acá, pero como todo Server Action queda invocable por POST directo
  // (ver comentario al inicio de src/lib/db/index.ts), este es el único lugar
  // que de verdad puede impedir que se guarde un cliente sin nombre o con una
  // patente vacía — son las dos columnas NOT NULL de "clientes" (ver
  // src/db/schema.ts). El perfil "Gerencia" queda exento de la validación de
  // *formato* de la patente (ver esExentoFormatoCliente en @/lib/helpers),
  // igual que en ClientModal, pero nombre y patente no vacíos se exigen a
  // todos porque ninguna sesión puede saltarse un NOT NULL de la base.
  const exentoFormato = esExentoFormatoCliente(sesion.nombre);
  if (rows.some((r) => !r.nombre?.trim() || !r.patente?.trim() || (!exentoFormato && !isValidPatente(r.patente))))
    return false;
  return dataAccess.upsertClientes(rows);
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteClientes(ids);
}
