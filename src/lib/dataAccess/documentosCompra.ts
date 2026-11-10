import "server-only";

import { desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "@/db";
import { documentosCompra } from "@/db/schema";
import type { DocumentoCompra } from "@/types";

type Fila = typeof documentosCompra.$inferSelect;

// Todas las columnas menos el XML: pesa y la lista no lo usa (se baja
// aparte, ver xmlDocumentoCompra).
function columnasSinXml() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { xml, ...resto } = getTableColumns(documentosCompra);
  return resto;
}

function documentoCompraFromRow(r: Omit<Fila, "xml">): DocumentoCompra {
  return {
    id: r.id,
    tipoDte: r.tipoDte,
    folio: r.folio,
    fechaEmision: r.fechaEmision,
    fechaVencimiento: r.fechaVencimiento ?? undefined,
    rutEmisor: r.rutEmisor,
    razonSocialEmisor: r.razonSocialEmisor,
    giroEmisor: r.giroEmisor ?? undefined,
    montoNeto: r.montoNeto,
    montoExento: r.montoExento,
    iva: r.iva,
    montoTotal: r.montoTotal,
    detalle: r.detalle ?? [],
    correoDe: r.correoDe ?? undefined,
    correoAsunto: r.correoAsunto ?? undefined,
    recibidoEn: r.recibidoEn,
    estado: r.estado as DocumentoCompra["estado"],
    clasificacion: (r.clasificacion ??
      undefined) as DocumentoCompra["clasificacion"],
    categoria: r.categoria ?? undefined,
    movimientoContableId: r.movimientoContableId ?? undefined,
    clasificadoEn: r.clasificadoEn ?? undefined,
    clasificadoPor: r.clasificadoPor ?? undefined,
  };
}

/** Inserta los documentos nuevos; los que ya existen (mismo emisor, tipo y
 * folio) se dejan como están, con su clasificación. Devuelve cuántos eran
 * nuevos, o null si falló la base. */
export async function insertarDocumentosCompra(
  rows: (typeof documentosCompra.$inferInsert)[],
): Promise<number | null> {
  if (!rows.length) return 0;
  try {
    const insertados = await getDb()
      .insert(documentosCompra)
      .values(rows)
      .onConflictDoNothing({ target: documentosCompra.id })
      .returning({ id: documentosCompra.id });
    return insertados.length;
  } catch (error) {
    console.error("Error guardando documentos de compra", error);
    return null;
  }
}

export async function listarDocumentosCompra(): Promise<
  DocumentoCompra[] | null
> {
  try {
    const filas = await getDb()
      .select(columnasSinXml())
      .from(documentosCompra)
      .orderBy(
        desc(documentosCompra.fechaEmision),
        desc(documentosCompra.recibidoEn),
      );
    return filas.map(documentoCompraFromRow);
  } catch (error) {
    console.error("Error leyendo documentos de compra", error);
    return null;
  }
}

export async function obtenerDocumentoCompra(
  id: string,
): Promise<DocumentoCompra | null> {
  const [fila] = await getDb()
    .select(columnasSinXml())
    .from(documentosCompra)
    .where(eq(documentosCompra.id, id));
  return fila ? documentoCompraFromRow(fila) : null;
}

export async function xmlDocumentoCompra(id: string): Promise<string | null> {
  const [fila] = await getDb()
    .select({ xml: documentosCompra.xml })
    .from(documentosCompra)
    .where(eq(documentosCompra.id, id));
  return fila?.xml ?? null;
}

export async function actualizarClasificacionCompra(
  id: string,
  cambios: Pick<DocumentoCompra, "estado"> & {
    clasificacion: DocumentoCompra["clasificacion"] | null;
    categoria: string | null;
    movimientoContableId: string | null;
    clasificadoPor: string | null;
  },
): Promise<boolean> {
  try {
    await getDb()
      .update(documentosCompra)
      .set({
        ...cambios,
        clasificadoEn: cambios.clasificacion ? new Date().toISOString() : null,
      })
      .where(eq(documentosCompra.id, id));
    return true;
  } catch (error) {
    console.error("Error clasificando documento de compra", error);
    return false;
  }
}
