"use server";

import * as dataAccess from "@/lib/dataAccess";
import { esExentoFormatoCliente, esNombreVacio, isValidPatente } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { Cliente } from "@/types";

// Campos que registrarIngreso() (@/lib/actions) toca como efecto colateral de
// dar ingreso a un vehículo en el módulo Operador: cualquier sesión válida
// puede provocar este patch aunque no tenga el módulo "clientes" (ver
// esCambioPermitidoSinModuloClientes más abajo). El resto de los campos solo
// puede cambiarlos una sesión con "clientes" (ClientModal/BulkModal).
const CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES = new Set<keyof Cliente>(["visitas", "ultimaVisita"]);

// Campos que OperadorFoundResult deja completar cuando llegan vacíos (nombre,
// vehículo, teléfono, correo): la UI solo muestra el input de cada uno
// cuando el campo todavía está vacío (ver c.vehiculo ? … : <input>… en ese
// componente), así que un cambio en estos campos nunca sobreescribe un valor
// ya guardado — es completar una ficha "INVITADO"/incompleta, no editarla.
const CAMPOS_COMPLETABLES_SIN_MODULO_CLIENTES = new Set<keyof Cliente>(["nombre", "vehiculo", "telefono", "email"]);

// Campos que renovar/reactivar/renovarWeb/contratarPlan/upgradeAPlan (ver
// OperadorFoundResult) y renovarPlan (@/lib/actions) tocan sobre un cliente
// ya existente al vender/renovar/reactivar un plan desde el módulo Operador.
// Ningún perfil de operador tiene el módulo "clientes" por defecto (ver
// PERFILES_DEFAULT) — sin esta excepción, cualquier venta de plan quedaba
// bloqueada acá. Como commit() ya inserta la Venta correspondiente sin
// depender de que este upsert de clientes tenga éxito (ver AppContext.commit,
// commitClientes se espera antes que commitVentas pero no lo condiciona), el
// operador veía "sin conexión", reintentaba, y quedaban Ventas duplicadas
// cobradas sin que el plan del cliente llegara a activarse nunca.
const CAMPOS_VENTA_PLAN_SIN_MODULO_CLIENTES = new Set<keyof Cliente>(["plan", "vencimiento", "ultimaRenovacion"]);

// Antes, upsertClientes exigía solo tieneSesionValida(): cualquier perfil
// logueado podía guardar un cliente. Al agregar el gate de tieneModulo
// ("clientes") para proteger la edición real de clientes (alta/edición desde
// ClientModal/BulkModal), este mismo Server Action también recibe, sin que el
// operador lo note, el patch incidental que registrarIngreso() hace sobre
// `visitas`/`ultimaVisita` en cada "Registrar ingreso" — y como los perfiles
// de operador no tienen el módulo "clientes" por defecto, ese patch quedaba
// bloqueado y el commit completo (ingreso incluido) se revertía. Por eso acá
// se compara cada fila contra lo que ya hay en la base: si el único cambio
// real es visitas/ultimaVisita, se permite sin el módulo "clientes".
//
// Además, dar de alta un vehículo *nuevo* desde el botón "+ Agregar vehículo
// nuevo" del módulo Operador (ClientModal con contexto="operador") tampoco
// pasaba este chequeo: al no existir todavía la fila en la base, no calzaba
// como "solo visitas" y quedaba bloqueado igual, mostrando "sin conexión" en
// vez de reflejar que era un tema de permisos — un operador sin el módulo
// "clientes" (el caso por defecto, ver PERFILES_DEFAULT) nunca podía registrar
// un cliente que llegaba por primera vez. Se exime también ese caso: una fila
// que no existe aún en la base es un alta, no una edición de datos ajenos, y
// cualquier sesión con el módulo "operador" ya puede hacer ese alta desde el
// punto de venta.
async function esCambioPermitidoSinModuloClientes(rows: Cliente[]): Promise<boolean> {
  const anteriores = await dataAccess.getClientesByIds(rows.map((r) => r.id));
  const porId = new Map(anteriores.map((c) => [c.id, c]));
  const soloVisitas = rows.every((row) => {
    const anterior = porId.get(row.id);
    if (!anterior) return false;
    return (Object.keys(row) as (keyof Cliente)[]).every(
      (campo) => CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES.has(campo) || row[campo] === anterior[campo]
    );
  });
  if (soloVisitas) return true;

  const todasAltasNuevas = rows.every((row) => !porId.has(row.id));
  if (todasAltasNuevas) return tieneModulo("operador");

  // Fila ya existente (p.ej. "INVITADO" creada con datos mínimos) a la que
  // el operador le está completando nombre/vehículo/teléfono/correo desde
  // OperadorFoundResult: mismo criterio que un alta, solo que la fila ya
  // existía en la base con esos campos vacíos.
  const soloCompletaDatosVacios = rows.every((row) => {
    const anterior = porId.get(row.id);
    if (!anterior) return false;
    return (Object.keys(row) as (keyof Cliente)[]).every((campo) => {
      if (CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES.has(campo) || row[campo] === anterior[campo]) return true;
      if (!CAMPOS_COMPLETABLES_SIN_MODULO_CLIENTES.has(campo)) return false;
      // "nombre" cuenta como vacío también con el placeholder "Sin nombre"
      // que deja la carga masiva por Excel (ver esNombreVacio) — un string
      // truthy que un simple !anterior[campo] no detectaría.
      return campo === "nombre" ? esNombreVacio(anterior.nombre) : !anterior[campo];
    });
  });
  if (soloCompletaDatosVacios) return tieneModulo("operador");

  const soloVentaDePlan = rows.every((row) => {
    const anterior = porId.get(row.id);
    if (!anterior) return false;
    return (Object.keys(row) as (keyof Cliente)[]).every(
      (campo) =>
        CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES.has(campo) ||
        CAMPOS_VENTA_PLAN_SIN_MODULO_CLIENTES.has(campo) ||
        row[campo] === anterior[campo]
    );
  });
  return soloVentaDePlan && (await tieneModulo("operador"));
}

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  if (!(await tieneModulo("clientes")) && !(await esCambioPermitidoSinModuloClientes(rows))) return false;
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
