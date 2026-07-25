"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esExentoFormatoCliente, isValidPatente } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { Cliente } from "@/types";

// Campos que registrarIngreso() (@/lib/actions) toca como efecto colateral de
// dar ingreso a un vehículo en el módulo Operador: cualquier sesión válida
// puede provocar este patch aunque no tenga el módulo "clientes" (ver
// esSoloActualizacionDeVisita más abajo). El resto de los campos solo puede
// cambiarlos una sesión con "clientes" (ClientModal/BulkModal).
const CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES = new Set<keyof Cliente>(["visitas", "ultimaVisita"]);

// Antes, upsertClientes exigía solo tieneSesionValida(): cualquier perfil
// logueado podía guardar un cliente. Al agregar el gate de tieneModulo
// ("clientes") para proteger la edición real de clientes (alta/edición desde
// ClientModal/BulkModal), este mismo Server Action también recibe, sin que el
// operador lo note, el patch incidental que registrarIngreso() hace sobre
// `visitas`/`ultimaVisita` en cada "Registrar ingreso" — y como los perfiles
// de operador no tienen el módulo "clientes" por defecto, ese patch quedaba
// bloqueado y el commit completo (ingreso incluido) se revertía. Por eso acá
// se compara cada fila contra lo que ya hay en la base: si el único cambio
// real es visitas/ultimaVisita, se permite sin el módulo "clientes"; si toca
// cualquier otro campo (nombre, patente, teléfono, etc.), se sigue exigiendo
// el módulo, igual que antes de este chequeo.
async function esSoloActualizacionDeVisita(rows: Cliente[]): Promise<boolean> {
  const anteriores = await dataAccess.getClientesByIds(rows.map((r) => r.id));
  const porId = new Map(anteriores.map((c) => [c.id, c]));
  return rows.every((row) => {
    const anterior = porId.get(row.id);
    if (!anterior) return false;
    return (Object.keys(row) as (keyof Cliente)[]).every(
      (campo) => CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES.has(campo) || row[campo] === anterior[campo]
    );
  });
}

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  if (!(await tieneModulo("clientes")) && !(await esSoloActualizacionDeVisita(rows))) return false;
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
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.deleteClientes(ids);
}
