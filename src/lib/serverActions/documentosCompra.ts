"use server";

import * as dataAccess from "@/lib/dataAccess";
import {
  recibirDocumentosCompra,
  type ResultadoRecepcionCompras,
} from "@/lib/comprasRecepcion";
import { CATEGORIAS_ACTIVO } from "@/lib/dteCompra";
import { sesionActual, tieneModulo } from "@/lib/session";
import type { DocumentoCompra } from "@/types";

// Pestaña Facturas de compra. Todo exige el módulo "contabilidad": clasificar
// crea o vincula egresos, y eso ya pide ese módulo (ver
// upsertMovimientosContables).

export async function listarFacturasCompra(): Promise<
  DocumentoCompra[] | null
> {
  if (!(await tieneModulo("contabilidad"))) return null;
  return dataAccess.listarDocumentosCompra();
}

export async function revisarCorreoCompras(): Promise<ResultadoRecepcionCompras> {
  if (!(await tieneModulo("contabilidad")))
    return {
      ok: false,
      correos: 0,
      documentos: 0,
      nuevos: 0,
      deOtroReceptor: 0,
      error: "Sin permiso",
    };
  return recibirDocumentosCompra();
}

export async function xmlFacturaCompra(id: string): Promise<string | null> {
  if (!(await tieneModulo("contabilidad"))) return null;
  return dataAccess.xmlDocumentoCompra(String(id));
}

/** Guarda la clasificación. Para un gasto, el egreso ya lo creó o vinculó la
 * pestaña con commit() (así pasa por los mismos permisos y candados de día
 * cerrado que un egreso cargado a mano) y acá llega su id. */
export async function clasificarFacturaCompra(
  id: string,
  clasificacion: "gasto" | "activo",
  categoria: string,
  movimientoContableId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("contabilidad"))
    return { ok: false, error: "Sin permiso" };
  const cat = String(categoria ?? "").trim();
  if (!cat) return { ok: false, error: "Falta la categoría" };
  if (
    clasificacion === "activo" &&
    !(CATEGORIAS_ACTIVO as readonly string[]).includes(cat)
  )
    return { ok: false, error: "Categoría de activo inválida" };
  if (clasificacion === "gasto" && !movimientoContableId)
    return { ok: false, error: "Falta el egreso" };
  if (clasificacion !== "gasto" && clasificacion !== "activo")
    return { ok: false, error: "Clasificación inválida" };
  const doc = await dataAccess.obtenerDocumentoCompra(String(id));
  if (!doc) return { ok: false, error: "No existe el documento" };
  const ok = await dataAccess.actualizarClasificacionCompra(doc.id, {
    estado: "contabilizado",
    clasificacion,
    categoria: cat,
    movimientoContableId:
      clasificacion === "gasto" ? movimientoContableId : null,
    clasificadoPor: sesion.nombre,
  });
  return ok ? { ok } : { ok, error: "No se pudo guardar" };
}

/** Ignorar (p. ej. un documento duplicado o que no es de la empresa) o
 * devolverlo a pendiente. Uno ya contabilizado primero se desclasifica. */
export async function marcarFacturaCompra(
  id: string,
  estado: "ignorado" | "pendiente",
): Promise<{ ok: boolean; error?: string }> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.modulos.includes("contabilidad"))
    return { ok: false, error: "Sin permiso" };
  if (estado !== "ignorado" && estado !== "pendiente")
    return { ok: false, error: "Estado inválido" };
  const doc = await dataAccess.obtenerDocumentoCompra(String(id));
  if (!doc) return { ok: false, error: "No existe el documento" };
  // Ignorar uno contabilizado dejaría su egreso huérfano en Contabilidad.
  if (doc.estado === "contabilizado")
    return {
      ok: false,
      error:
        "Ya está contabilizado: cambia su clasificación en vez de ignorarlo",
    };
  const ok = await dataAccess.actualizarClasificacionCompra(doc.id, {
    estado,
    clasificacion: null,
    categoria: null,
    movimientoContableId: null,
    clasificadoPor: null,
  });
  return ok ? { ok } : { ok, error: "No se pudo guardar" };
}
