import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { estanques, lecturasEstanque, valvulas } from "@/db/schema";
import type { Estanque, EstanqueConLectura, Valvula } from "@/types";
import { safe, upsertRows } from "./shared";

type EstanqueRow = typeof estanques.$inferSelect;
type ValvulaRow = typeof valvulas.$inferSelect;

function estanqueToRow(e: Estanque): typeof estanques.$inferInsert {
  return {
    id: e.id,
    nombre: e.nombre,
    contenido: e.contenido || null,
    capacidadLitros: e.capacidadLitros,
    offsetCrudo: e.offsetCrudo,
    litrosPorUnidad: e.litrosPorUnidad,
    umbralBajoLitros: e.umbralBajoLitros ?? null,
    activo: e.activo,
    creadoEn: e.creadoEn,
    creadoPor: e.creadoPor || null,
  };
}

function estanqueFromRow(r: EstanqueRow): Estanque {
  return {
    id: r.id,
    nombre: r.nombre,
    contenido: r.contenido || undefined,
    capacidadLitros: r.capacidadLitros,
    offsetCrudo: r.offsetCrudo,
    litrosPorUnidad: r.litrosPorUnidad,
    umbralBajoLitros: r.umbralBajoLitros ?? undefined,
    activo: r.activo,
    creadoEn: r.creadoEn,
    creadoPor: r.creadoPor || undefined,
  };
}

function valvulaToRow(v: Valvula): typeof valvulas.$inferInsert {
  return {
    id: v.id,
    nombre: v.nombre,
    estanqueId: v.estanqueId || null,
    abierta: v.abierta,
    cambiadoEn: v.cambiadoEn,
    cambiadoPor: v.cambiadoPor || null,
    confirmadaEn: v.confirmadaEn || null,
    activo: v.activo,
  };
}

function valvulaFromRow(r: ValvulaRow): Valvula {
  return {
    id: r.id,
    nombre: r.nombre,
    estanqueId: r.estanqueId || undefined,
    abierta: r.abierta,
    cambiadoEn: r.cambiadoEn,
    cambiadoPor: r.cambiadoPor || undefined,
    confirmadaEn: r.confirmadaEn || undefined,
    activo: r.activo,
  };
}

/** Estanques con su última lectura + válvulas. Es todo lo que necesita la
 *  vista, en dos queries: el historial completo no se carga nunca (ver el
 *  comentario de @/types/estanques). */
export async function cargarEstanques(): Promise<{ estanques: EstanqueConLectura[]; valvulas: Valvula[] }> {
  const db = getDb();
  const [filas, ultimas, valvulasFilas] = await Promise.all([
    safe(db.select().from(estanques)),
    // DISTINCT ON: una fila por estanque, la más reciente. Barato con el
    // índice (estanque_id, medido_en) — no recorre la serie completa.
    safe(
      db
        .selectDistinctOn([lecturasEstanque.estanqueId])
        .from(lecturasEstanque)
        .orderBy(lecturasEstanque.estanqueId, desc(lecturasEstanque.medidoEn))
    ),
    safe(db.select().from(valvulas)),
  ]);

  const porEstanque = new Map(ultimas.map((l) => [l.estanqueId, l]));
  return {
    estanques: filas.map((r) => {
      const ultima = porEstanque.get(r.id);
      return {
        ...estanqueFromRow(r),
        ultima: ultima ? { crudo: ultima.crudo, medidoEn: ultima.medidoEn } : null,
      };
    }),
    valvulas: valvulasFilas.map(valvulaFromRow),
  };
}

export async function upsertEstanques(rows: Estanque[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await upsertRows(estanques, estanques.id, rows.map(estanqueToRow));
    return true;
  } catch (error) {
    console.error("Error guardando estanques", error);
    return false;
  }
}

export async function deleteEstanques(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    // lecturas_estanque cae por cascade (es telemetría, no bitácora de
    // negocio); valvulas.estanque_id queda en null.
    await getDb().delete(estanques).where(inArray(estanques.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando estanques", error);
    return false;
  }
}

export async function crearValvula(v: Valvula): Promise<boolean> {
  try {
    await getDb().insert(valvulas).values(valvulaToRow(v));
    return true;
  } catch (error) {
    console.error("Error creando la válvula", error);
    return false;
  }
}

/** Edita SOLO los campos de configuración. Nunca toca `abierta`,
 *  `cambiado_*` ni `confirmada_en`.
 *
 *  Antes esto era un upsert de la fila completa desde el snapshot que tenía
 *  la pantalla, que se refresca cada 15s: renombrar una válvula reescribía
 *  el `abierta` viejo y cerraba (o reabría) agua de verdad. Cambiarle el
 *  nombre a algo no puede accionarlo. */
export async function actualizarValvula(
  id: string,
  campos: { nombre?: string; estanqueId?: string; activo?: boolean }
): Promise<boolean> {
  try {
    await getDb()
      .update(valvulas)
      .set({
        ...(campos.nombre !== undefined ? { nombre: campos.nombre } : {}),
        ...(campos.estanqueId !== undefined ? { estanqueId: campos.estanqueId || null } : {}),
        ...(campos.activo !== undefined ? { activo: campos.activo } : {}),
      })
      .where(eq(valvulas.id, id));
    return true;
  } catch (error) {
    console.error("Error actualizando la válvula", error);
    return false;
  }
}

export async function deleteValvulas(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await getDb().delete(valvulas).where(inArray(valvulas.id, ids));
    return true;
  } catch (error) {
    console.error("Error eliminando válvulas", error);
    return false;
  }
}

/** Pide abrir/cerrar. No marca `confirmada_en`: eso lo estampa el propio
 *  dispositivo cuando reporta que aplicó el cambio (ver sincronizarConfirmaciones). */
export async function setValvula(id: string, abierta: boolean, quien: string | null): Promise<boolean> {
  try {
    await getDb()
      .update(valvulas)
      .set({ abierta, cambiadoEn: new Date().toISOString(), cambiadoPor: quien, confirmadaEn: null })
      .where(eq(valvulas.id, id));
    return true;
  } catch (error) {
    console.error("Error cambiando la válvula", error);
    return false;
  }
}

/** Cierre decidido por el servidor (estanque lleno, apertura caducada,
 *  válvula dada de baja). Escribe el cierre de verdad en vez de enmascarar la
 *  respuesta: así queda enganchado, visible en pantalla y con motivo. */
export async function cerrarValvulasAutomatico(ids: string[], motivo: string): Promise<void> {
  if (!ids.length) return;
  try {
    await getDb()
      .update(valvulas)
      .set({ abierta: false, cambiadoEn: new Date().toISOString(), cambiadoPor: motivo, confirmadaEn: null })
      .where(inArray(valvulas.id, ids));
  } catch (error) {
    console.error("Error cerrando válvulas automáticamente", error);
  }
}

export async function insertLecturas(rows: { id: string; estanqueId: string; crudo: number }[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await getDb().insert(lecturasEstanque).values(rows);
    return true;
  } catch (error) {
    console.error("Error guardando lecturas de estanque", error);
    return false;
  }
}

/** Marca confirmadas las válvulas cuyo estado real coincide con el pedido y
 *  DESmarca las que no.
 *
 *  Las dos mitades importan: si solo se estampara la coincidencia, una
 *  válvula confirmada abierta que después queda trabada (o que el
 *  controlador cerró por su cuenta) seguiría mostrando el timestamp viejo y
 *  la pantalla la pintaría "Abierta" para siempre. Sin confirmación, la UI la
 *  muestra "Sin confirmar", que es exactamente lo que pasa. */
export async function sincronizarConfirmaciones(confirmadas: string[], discrepantes: string[]): Promise<void> {
  const db = getDb();
  try {
    await Promise.all([
      confirmadas.length
        ? db.update(valvulas).set({ confirmadaEn: new Date().toISOString() }).where(inArray(valvulas.id, confirmadas))
        : Promise.resolve(),
      discrepantes.length
        ? db.update(valvulas).set({ confirmadaEn: null }).where(inArray(valvulas.id, discrepantes))
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("Error sincronizando confirmaciones de válvulas", error);
  }
}
