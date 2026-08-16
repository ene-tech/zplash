"use server";

import * as dataAccess from "@/lib/dataAccess";
import { crearCarpeta, eliminarCarpeta, renombrarCarpeta } from "@/lib/buzon/carpetas";
import { aplicarFiltrosCorreo } from "@/lib/buzon/filtros";
import { listarCarpetas as listarCarpetasImpl, listarCorreos as listarCorreosImpl, obtenerAdjunto as obtenerAdjuntoImpl, obtenerCorreo as obtenerCorreoImpl } from "@/lib/buzon/leer";
import { tieneModulo } from "@/lib/session";
import type {
  AdjuntoDescargado,
  CarpetaBuzon,
  CorreoAutomatico,
  CorreoAutomaticoResumen,
  CorreoDetalle,
  CorreoResumen,
  ReglaFiltroCorreo,
  ResultadoFiltrosCorreo,
} from "@/types";

// El envío (redactar/responder) NO vive acá: pasa por /api/correo/enviar
// (multipart/form-data) porque necesita aceptar adjuntos reales, y los
// Server Actions de Next capan el body a 1MB por defecto — ver comentario en
// esa ruta.

export async function listarCarpetasBuzon(): Promise<CarpetaBuzon[]> {
  if (!(await tieneModulo("correo"))) return [];
  return listarCarpetasImpl();
}

export async function listarCorreos(carpetaPath: string): Promise<CorreoResumen[]> {
  if (!(await tieneModulo("correo"))) return [];
  return listarCorreosImpl(carpetaPath);
}

export async function obtenerCorreo(carpetaPath: string, uid: number): Promise<CorreoDetalle | null> {
  if (!(await tieneModulo("correo"))) return null;
  return obtenerCorreoImpl(carpetaPath, uid);
}

export async function obtenerAdjuntoCorreo(carpetaPath: string, uid: number, indice: number): Promise<AdjuntoDescargado | null> {
  if (!(await tieneModulo("correo"))) return null;
  return obtenerAdjuntoImpl(carpetaPath, uid, indice);
}

export async function crearCarpetaBuzon(nombre: string): Promise<boolean> {
  if (!(await tieneModulo("correo"))) return false;
  return crearCarpeta(nombre);
}

export async function renombrarCarpetaBuzon(pathActual: string, nuevoNombre: string): Promise<boolean> {
  if (!(await tieneModulo("correo"))) return false;
  return renombrarCarpeta(pathActual, nuevoNombre);
}

export async function eliminarCarpetaBuzon(path: string): Promise<boolean> {
  if (!(await tieneModulo("correo"))) return false;
  return eliminarCarpeta(path);
}

export async function listarReglasFiltroCorreo(): Promise<ReglaFiltroCorreo[]> {
  if (!(await tieneModulo("correo"))) return [];
  return dataAccess.listarReglasFiltroCorreo();
}

export async function upsertReglasFiltroCorreo(reglas: ReglaFiltroCorreo[]): Promise<boolean> {
  if (!(await tieneModulo("correo"))) return false;
  return dataAccess.upsertReglasFiltroCorreo(reglas);
}

export async function deleteReglasFiltroCorreo(ids: string[]): Promise<boolean> {
  if (!(await tieneModulo("correo"))) return false;
  return dataAccess.deleteReglasFiltroCorreo(ids);
}

// Botón "Aplicar ahora" del panel de Filtros — corre el mismo motor que el
// cron diario (ver /api/correo/filtros/evaluar) pero disparado a mano, para
// no depender solo de esperar la próxima corrida programada.
export async function aplicarFiltrosCorreoAhora(): Promise<ResultadoFiltrosCorreo> {
  if (!(await tieneModulo("correo"))) return { revisados: 0, movidos: 0, aPapelera: 0, marcadosLeidos: 0, error: "Sin permiso" };
  const reglas = await dataAccess.listarReglasFiltroCorreo();
  return aplicarFiltrosCorreo(reglas);
}

// Bandeja de salida del remitente automático (Correo → Salida automática).
// Los datos son del dominio mail (correos_automaticos, escrita por
// @/lib/mailing/proveedor) pero las acciones viven acá, con las del buzón
// IMAP, porque las consume la misma pantalla y por lo tanto piden el mismo
// módulo "correo": un perfil que puede leer info@ puede ver también qué le
// salió al cliente desde no-reply@.
export async function listarCorreosAutomaticos(): Promise<CorreoAutomaticoResumen[]> {
  if (!(await tieneModulo("correo"))) return [];
  return dataAccess.listarCorreosAutomaticos();
}

export async function obtenerCorreoAutomatico(id: string): Promise<CorreoAutomatico | null> {
  if (!(await tieneModulo("correo"))) return null;
  return dataAccess.obtenerCorreoAutomatico(id);
}
