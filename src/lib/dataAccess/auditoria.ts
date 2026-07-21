import "server-only";

import { getDb } from "@/db";
import { auditoria } from "@/db/schema";
import type { AuditoriaEntrada } from "@/types";

// Log de auditoría: de solo escritura (append-only), nunca se actualiza ni
// se borra desde la app. Falla en silencio (solo loguea a consola) para que
// un problema con la auditoría nunca bloquee ni revierta la escritura de
// negocio real que la originó — ver cómo se llama desde commit() en
// AppContext.tsx (después de confirmar que la escritura principal sí ok).
export async function insertAuditoria(entradas: AuditoriaEntrada[]): Promise<boolean> {
  if (!entradas.length) return true;
  try {
    await getDb()
      .insert(auditoria)
      .values(
        entradas.map((e) => ({
          tabla: e.tabla,
          registroId: e.registroId,
          accion: e.accion,
          datosAnteriores: e.datosAnteriores ?? null,
          datosNuevos: e.datosNuevos ?? null,
          usuario: e.usuario,
        }))
      );
    return true;
  } catch (error) {
    console.error("Error guardando auditoría", error);
    return false;
  }
}
