"use server";

import { after } from "next/server";
import * as dataAccess from "@/lib/dataAccess";
import { esExentoFormatoCliente, esNombreVacio, isValidPatente, isValidTelefono, normPlate, resolverPatentePendiente } from "@/lib/helpers";
import { sesionActual, tieneModulo } from "@/lib/session";
import { evaluarReglasPorCambioPatente } from "@/lib/whatsapp/reglas";
import type { Cliente, ClientePatch } from "@/types";

// Campos que registrarIngreso() (@/lib/logic) toca como efecto colateral de
// dar ingreso a un vehículo en el módulo Operador: cualquier sesión válida
// puede provocar este patch aunque no tenga el módulo "clientes" (ver
// esCambioPermitidoSinModuloClientes más abajo). El resto de los campos solo
// puede cambiarlos una sesión con "clientes" (ClientModal/BulkModal).
// patentePendiente/patentePendienteDesde también van acá aunque no las toque
// registrarIngreso(): son un campo administrado por el sistema (ver
// resolverPatentePendiente), no algo que un operador renovando un plan
// (CAMPOS_VENTA_PLAN_SIN_MODULO_CLIENTES) esté pidiendo cambiar — sin esto,
// si su copia local del cliente queda desactualizada respecto a una
// solicitud de cambio de patente guardada recién por un admin, la
// comparación `row[campo] === anterior[campo]` de abajo las ve distintas y
// bloquea sin motivo una renovación legítima.
const CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES = new Set<keyof Cliente>([
  "visitas",
  "ultimaVisita",
  "patentePendiente",
  "patentePendienteDesde",
]);

// Campos que OperadorFoundResult deja completar cuando llegan vacíos (nombre,
// vehículo, teléfono, correo): la UI solo muestra el input de cada uno
// cuando el campo todavía está vacío (ver c.vehiculo ? … : <input>… en ese
// componente), así que un cambio en estos campos nunca sobreescribe un valor
// ya guardado — es completar una ficha "INVITADO"/incompleta, no editarla.
const CAMPOS_COMPLETABLES_SIN_MODULO_CLIENTES = new Set<keyof Cliente>(["nombre", "vehiculo", "telefono", "email"]);

// Campos que renovar/reactivar/renovarWeb/contratarPlan/upgradeAPlan (ver
// OperadorFoundResult) y renovarPlan (@/lib/logic) tocan sobre un cliente
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
// Desde que upsertClientes recibe patches (solo los campos que la sesión
// realmente cambió, ver patchDeCliente en @/lib/helpers/clientes) en vez de
// la fila completa, "qué campos toca esta escritura" es simplemente
// Object.keys(patch) — ya no hace falta comparar valor por valor contra
// `anterior` para saberlo (un campo ausente del patch, por definición, no
// cambió).
function patchSoloContiene(patch: ClientePatch, permitidos: Set<keyof Cliente>): boolean {
  return (Object.keys(patch) as (keyof Cliente)[]).every((campo) => campo === "id" || permitidos.has(campo));
}

async function esCambioPermitidoSinModuloClientes(patches: ClientePatch[], porId: Map<string, Cliente>): Promise<boolean> {
  const soloVisitas = patches.every(
    (patch) => porId.has(patch.id) && patchSoloContiene(patch, CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES)
  );
  if (soloVisitas) return true;

  const todasAltasNuevas = patches.every((patch) => !porId.has(patch.id));
  if (todasAltasNuevas) return tieneModulo("operador");

  // Fila ya existente (p.ej. "INVITADO" creada con datos mínimos) a la que
  // el operador le está completando nombre/vehículo/teléfono/correo desde
  // OperadorFoundResult: mismo criterio que un alta, solo que la fila ya
  // existía en la base con esos campos vacíos.
  const soloCompletaDatosVacios = patches.every((patch) => {
    const anterior = porId.get(patch.id);
    if (!anterior) return false;
    return (Object.keys(patch) as (keyof Cliente)[]).every((campo) => {
      if (campo === "id" || CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES.has(campo)) return true;
      if (!CAMPOS_COMPLETABLES_SIN_MODULO_CLIENTES.has(campo)) return false;
      // "nombre" cuenta como vacío también con el placeholder "Sin nombre"
      // que deja la carga masiva por Excel (ver esNombreVacio), y "telefono"
      // con cualquier valor que no pase isValidTelefono — p.ej. el
      // placeholder "+569" que queda guardado tal cual si alguna vez se tocó
      // "Guardar" sin tipear los 8 dígitos (ver el input en
      // OperadorFoundResult, que precarga "+569" como ayuda). En ambos casos
      // es un string truthy que un simple !anterior[campo] no detecta como
      // "vacío", y sin esto un operador sin el módulo "clientes" queda
      // bloqueado para siempre corrigiendo ese dato corrupto — ve "sin
      // conexión" en vez de poder completar el teléfono real.
      if (campo === "nombre") return esNombreVacio(anterior.nombre);
      // isValidTelefono("") es true (el teléfono es opcional), así que hay
      // que seguir cubriendo el caso realmente vacío además del inválido.
      if (campo === "telefono") return !anterior.telefono || !isValidTelefono(anterior.telefono);
      return !anterior[campo];
    });
  });
  if (soloCompletaDatosVacios) return tieneModulo("operador");

  const soloVentaDePlan = patches.every(
    (patch) =>
      porId.has(patch.id) &&
      patchSoloContiene(patch, new Set([...CAMPOS_ACTUALIZABLES_SIN_MODULO_CLIENTES, ...CAMPOS_VENTA_PLAN_SIN_MODULO_CLIENTES]))
  );
  return soloVentaDePlan && (await tieneModulo("operador"));
}

export async function upsertClientes(patches: ClientePatch[]): Promise<boolean> {
  const anteriores = await dataAccess.getClientesByIds(patches.map((p) => p.id));
  const porId = new Map(anteriores.map((c) => [c.id, c]));
  if (!(await tieneModulo("clientes")) && !(await esCambioPermitidoSinModuloClientes(patches, porId))) return false;
  const sesion = await sesionActual();
  if (!sesion) return false;
  // La UI (ClientModal/BulkModal) ya exige nombre y patente válida antes de
  // llamar acá, pero como todo Server Action queda invocable por POST directo
  // (ver comentario al inicio de src/lib/serverActions/index.ts), este es el único lugar
  // que de verdad puede impedir que se guarde un cliente sin nombre o con una
  // patente vacía — son las dos columnas NOT NULL de "clientes" (ver
  // src/db/schema.ts). Un patch que no toca nombre/patente se valida contra
  // el valor ya guardado (`anterior`): esos ya pasaron esta misma validación
  // cuando se escribieron, así que solo hay algo nuevo que chequear cuando el
  // patch los incluye — igual que un alta nueva, donde `anterior` no existe y
  // el patch (la fila completa, ver patchDeCliente) los tiene que traer sí o
  // sí. El perfil "Gerencia" queda exento de la validación de *formato* de la
  // patente (ver esExentoFormatoCliente en @/lib/helpers), igual que en
  // ClientModal, pero nombre y patente no vacíos se exigen a todos porque
  // ninguna sesión puede saltarse un NOT NULL de la base.
  const exentoFormato = esExentoFormatoCliente(sesion.nombre);
  if (
    patches.some((patch) => {
      const anterior = porId.get(patch.id);
      const nombre = patch.nombre ?? anterior?.nombre;
      const patente = patch.patente ?? anterior?.patente;
      return !nombre?.trim() || !patente?.trim() || (!exentoFormato && !isValidPatente(patente));
    })
  )
    return false;

  // Resuelve un cambio de patente pendiente (ver solicitarCambioPatente más
  // abajo) DESPUÉS del chequeo de permisos de arriba: ese chequeo debe evaluar
  // lo que el caller pidió cambiar de verdad (p.ej. un operador renovando un
  // plan, sin el módulo "clientes"), no el efecto colateral automático del
  // sistema de reemplazar la patente cuando el plan renueva a un período
  // nuevo — igual que vencimiento/plan/ultimaRenovacion en
  // CAMPOS_VENTA_PLAN_SIN_MODULO_CLIENTES, este swap nunca debe bloquearse
  // por falta del módulo "clientes".
  const cambiosPatente: { cliente: ClientePatch; patenteAnterior: string }[] = [];
  const parchesResueltos = patches.map((patch) => {
    const { fila, patenteAnterior } = resolverPatentePendiente(porId.get(patch.id), patch);
    if (patenteAnterior) cambiosPatente.push({ cliente: fila, patenteAnterior });
    return fila;
  });

  // Separa altas (la fila no existe todavía en la base, ver porId recién
  // leído) de ediciones: solo las primeras se insertan completas, las
  // segundas se escriben campo por campo (ver dataAccess.upsertClientes) para
  // no pisar en la base algo que esta sesión nunca supo que había cambiado.
  const nuevos: Cliente[] = [];
  const actualizaciones: { anterior: Cliente; patch: ClientePatch }[] = [];
  for (const patch of parchesResueltos) {
    const anterior = porId.get(patch.id);
    if (anterior) actualizaciones.push({ anterior, patch });
    else nuevos.push(patch as Cliente); // alta nueva: patchDeCliente ya garantiza la fila completa
  }

  const ok = await dataAccess.upsertClientes(nuevos, actualizaciones);
  // after() (no un .catch() suelto): mismo motivo que insertVentas/insertIngresos
  // (@/lib/dataAccess/ventas, ingresos) — que Vercel mantenga viva la función
  // hasta que termine el envío del WhatsApp de aviso.
  if (ok && cambiosPatente.length) {
    after(() =>
      Promise.all(
        cambiosPatente.map(({ cliente, patenteAnterior }) => {
          // evaluarReglasPorCambioPatente necesita la ficha completa (nombre,
          // plan, etc. para evaluar condiciones y armar el mensaje) — `cliente`
          // acá puede ser un patch parcial, así que se reconstruye mezclando
          // con `anterior` (recién leído de la base, ver arriba).
          const completo = { ...porId.get(cliente.id), ...cliente } as Cliente;
          return evaluarReglasPorCambioPatente(completo, patenteAnterior).catch((error) =>
            console.error("Error evaluando reglas de WhatsApp por cambio de patente", cliente.id, error)
          );
        })
      )
    );
  }
  return ok;
}

// Guarda la solicitud de cambio de patente (módulo Clientes, ver ClientModal):
// no se aplica de inmediato — recién se reemplaza `patente` cuando el plan
// vigente renueva a un período nuevo (ver resolverPatentePendiente en
// @/lib/helpers y su uso más arriba en upsertClientes, y en
// @/lib/pagos/aplicarPagoAprobado para renovaciones automáticas Oneclick).
export async function solicitarCambioPatente(clienteId: string, nuevaPatente: string): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  const sesion = await sesionActual();
  if (!sesion) return false;
  const patente = normPlate(nuevaPatente);
  if (!patente || (!esExentoFormatoCliente(sesion.nombre) && !isValidPatente(patente))) return false;

  const [actual] = await dataAccess.getClientesByIds([clienteId]);
  if (!actual) return false;
  if (normPlate(actual.patente) === patente) return false; // ya es la patente vigente, nada que solicitar

  const otro = await dataAccess.buscarClientePorPatente(patente);
  if (otro && otro.id !== clienteId) return false; // ya hay otro cliente con esa patente

  return dataAccess.actualizarPatentePendiente(clienteId, patente);
}

export async function cancelarCambioPatente(clienteId: string): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.actualizarPatentePendiente(clienteId, null);
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("clientes"))) return false;
  return dataAccess.deleteClientes(ids);
}
