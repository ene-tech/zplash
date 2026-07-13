"use server";

// Capa fina de Server Actions: cada función exportada de acá queda expuesta
// como un endpoint invocable por POST directo, sin pasar por la UI (así
// funcionan los Server Actions de Next.js — ver node_modules/next/dist/docs/
// .../mutating-data.md, "Server Functions are reachable via direct POST
// requests"). Por eso cada una empieza verificando la sesión antes de tocar
// datos; la lógica real de acceso a datos vive en @/lib/dataAccess, que no
// tiene esta directiva y por lo tanto no es invocable desde el navegador.
import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo, tieneSesionValida } from "@/lib/session";
import type {
  AppData,
  AuditoriaEntrada,
  CategoriaGasto,
  Cliente,
  Cupon,
  Empresa,
  Ingreso,
  MovimientoContable,
  PerfilPublico,
  Precios,
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

export async function insertIngresos(rows: Ingreso[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertIngresos(rows);
}

export async function insertVentas(rows: Venta[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertVentas(rows);
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

export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!(await tieneSesionValida())) return false;
  return dataAccess.insertAuditoria(entradas);
}

export async function subirComprobanteGasto(id: string, file: File): Promise<string | null> {
  if (!(await tieneSesionValida())) return null;
  return dataAccess.subirComprobanteGasto(id, file);
}
