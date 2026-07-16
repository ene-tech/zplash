"use server";

// Capa fina de Server Actions: cada función exportada de acá queda expuesta
// como un endpoint invocable por POST directo, sin pasar por la UI (así
// funcionan los Server Actions de Next.js — ver node_modules/next/dist/docs/
// .../mutating-data.md, "Server Functions are reachable via direct POST
// requests"). Por eso cada una empieza verificando la sesión antes de tocar
// datos; la lógica real de acceso a datos vive en @/lib/dataAccess, que no
// tiene esta directiva y por lo tanto no es invocable desde el navegador.
import * as dataAccess from "@/lib/dataAccess";
import type { SuscripcionOneclickInfo } from "@/lib/dataAccess";
import { ahoraEnSantiago, dentroDeHorarioOperador } from "@/lib/helpers";
import { cobrarSuscripcion } from "@/lib/pagos";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type {
  AppData,
  AuditoriaEntrada,
  BloqueoAgenda,
  CategoriaGasto,
  Cita,
  Cliente,
  ConfigGlobal,
  Cupon,
  Empresa,
  HorarioAgenda,
  Ingreso,
  MovimientoContable,
  PerfilPublico,
  Precios,
  Servicio,
  Venta,
} from "@/types";

// Se consulta antes de haber iniciado sesión (pantalla de login: necesita
// nombres/módulos de perfiles para mostrar el selector) — sin chequeo de
// sesión a propósito. Es de solo lectura y nunca incluye la clave.
export async function loadAll(): Promise<AppData> {
  return dataAccess.loadAll();
}

export async function waitForStorage(): Promise<boolean> {
  return dataAccess.waitForStorage();
}

export async function upsertClientes(rows: Cliente[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertClientes(rows);
}

export async function deleteClientes(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteClientes(ids);
}

// El bloqueo horario del módulo Operador (ver ConfigGlobal/ConfigTab) se
// revisa acá, no solo en la UI: la UI ya oculta los botones de registro fuera
// de horario, pero como todo Server Action queda invocable por POST directo
// (ver comentario al inicio del archivo), este es el único lugar que de
// verdad puede impedirlo. Se exime a quien tenga acceso a Configuración
// (Administración/Gerencia, ver esExentoHorarioOperador) y se relee `config`
// desde la base en vez de confiar en el horario que traiga el cliente.
export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  if (!(await tieneModulo("config"))) {
    let config: ConfigGlobal;
    try {
      config = await dataAccess.getConfig();
    } catch (error) {
      // Si getConfig() falla (p.ej. una migración pendiente en la base), no
      // dejar que reviente todo commit() sin aviso — el operador ve "no se
      // pudo guardar" en vez de perder el registro en silencio.
      console.error("Error leyendo config para el bloqueo horario del módulo Operador", error);
      return false;
    }
    // `new Date()` acá reflejaría la hora del servidor (en producción, UTC),
    // no la hora de Chile — hay que convertirla explícitamente (ver
    // ahoraEnSantiago) para comparar contra el horario configurado.
    if (!dentroDeHorarioOperador(config, ahoraEnSantiago())) return false;
  }
  return dataAccess.insertIngresos(rows);
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertVentas(rows);
}

export async function upsertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertVentas(rows);
}

// Gateada con "permisos" (Gerencia), a diferencia de insertVentas/
// upsertVentas: borrar un servicio ya registrado (y el pago Transbank que
// haya generado, si tuvo uno) es destructivo e irreversible, no una
// operación que cualquier operador con acceso a Servicios Adicionales deba
// poder hacer.
export async function deleteVentas(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.deleteVentas(ids);
}

// Módulo "permisos" en vez de una simple sesión: es el mismo requisito que
// ya aplica la UI (ver puedeAsignarPermisos en PerfilesTab.tsx) para
// modificar nombre/módulos de un perfil.
export async function upsertPerfiles(rows: PerfilPublico[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.upsertPerfiles(rows);
}

export async function deletePerfiles(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("permisos"))) return false;
  return dataAccess.deletePerfiles(ids);
}

export async function upsertPrecios(precios: Precios): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertPrecios(precios);
}

export async function upsertCupones(rows: Cupon[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCupones(rows);
}

export async function deleteCupones(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCupones(ids);
}

export async function upsertMovimientosContables(rows: MovimientoContable[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertMovimientosContables(rows);
}

export async function deleteMovimientosContables(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteMovimientosContables(ids);
}

export async function upsertCategoriasGasto(rows: CategoriaGasto[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCategoriasGasto(rows);
}

export async function upsertEmpresas(rows: Empresa[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertEmpresas(rows);
}

export async function deleteEmpresas(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteEmpresas(ids);
}

// Gateadas con el módulo "agenda": solo perfiles con acceso a esa pestaña
// pueden tocar el catálogo de servicios y el horario/bloqueos del negocio.
export async function upsertServicios(rows: Servicio[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.upsertServicios(rows);
}

export async function deleteServicios(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteServicios(ids);
}

export async function upsertHorariosAgenda(rows: HorarioAgenda[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.upsertHorariosAgenda(rows);
}

export async function deleteHorariosAgenda(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteHorariosAgenda(ids);
}

export async function upsertBloqueosAgenda(rows: BloqueoAgenda[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.upsertBloqueosAgenda(rows);
}

export async function deleteBloqueosAgenda(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("agenda"))) return false;
  return dataAccess.deleteBloqueosAgenda(ids);
}

// A diferencia de lo anterior, las citas en sí se gatean con una sesión
// simple (igual que insertVentas/insertIngresos): las crea cualquier
// operador con acceso a Servicios Adicionales al registrar un vehículo, no
// solo quien administra la Agenda.
export async function upsertCitas(rows: Cita[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.upsertCitas(rows);
}

export async function deleteCitas(ids: string[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.deleteCitas(ids);
}

export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertAuditoria(entradas);
}

export async function subirComprobanteGasto(id: string, file: File): Promise<string | null> {
  if (!(await tieneSesionValida())) return null;
  return dataAccess.subirComprobanteGasto(id, file);
}

export async function obtenerSuscripcionOneclick(patente: string): Promise<SuscripcionOneclickInfo | null> {
  if (!(await tieneModulo("clientes"))) return null;
  return dataAccess.obtenerSuscripcionOneclick(patente);
}

// Reintento manual de un cobro rechazado, disparado desde ClienteInfoModal.
// Usa la misma cobrarSuscripcion() que el cron diario — si el ciclo del mes
// ya se cobró (aprobado o rechazado), lanza y el modal muestra el error.
export async function cobrarSuscripcionManual(suscripcionId: string): Promise<{ estado: "aprobada" | "rechazada" } | null> {
  if (!(await tieneModulo("clientes"))) return null;
  const suscripcion = await dataAccess.obtenerSuscripcionOneclickPorId(suscripcionId);
  if (!suscripcion) return null;
  return cobrarSuscripcion(suscripcion);
}

// Gateada con "config", igual que el resto de la pestaña Administrador de
// Ingresos → Config: solo quien puede editar precios/horarios ahí puede
// cambiar el horario del bloqueo del módulo Operador.
export async function upsertConfig(cfg: ConfigGlobal): Promise<boolean> {
  if (!(await tieneModulo("config"))) return false;
  return dataAccess.upsertConfig(cfg);
}
