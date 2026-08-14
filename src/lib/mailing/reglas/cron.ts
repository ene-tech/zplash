import "server-only";

import { and, gte, isNotNull, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { listarReglasCorreoActivas, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { uid } from "@/lib/helpers";
import { construirVariables, ejecutarAccionReglaCorreo, MS_POR_DIA } from "./motor";
import type { ReglaCorreo } from "@/types";

// Cuánto atrás se sigue considerando "recién vencido" para tipoEvento
// "plan_vencido" — sin este tope, un cliente vencido hace meses (que nunca
// renovó) recibiría el aviso cada vez que el cron corre y encuentra la regla
// sin un disparo previo... salvo que ya tiene uno, porque el origenId
// incluye el vencimiento exacto (ver más abajo) y no cambia. El tope real
// contra reenvíos es ese origenId; esta ventana es solo para no barrer la
// tabla completa de clientes vencidos históricos cada vez que se activa una
// regla nueva.
const DIAS_VENTANA_PLAN_VENCIDO = 3;

/**
 * Llamado por el cron diario (/api/correo/reglas/evaluar): evalúa reglas
 * "plan_proximo_vencer" (mismo query que procesarPendientesYVencimientos de
 * WhatsApp, ver @/lib/whatsapp/reglas/cron) y "plan_vencido" (nuevo: sin
 * equivalente en WhatsApp hoy). Sin cola de "pendientes programados" con
 * delay — a diferencia del cron de WhatsApp, la v1 de correo solo dispara
 * inmediato (delayDias=0 en venta_creada/cobro_fallido, ver disparadores.ts).
 */
export async function procesarVencimientosCorreo(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  const ahoraISO = new Date().toISOString();
  const db = getDb();

  async function dispararParaClientes(regla: ReglaCorreo, rows: (typeof clientes.$inferSelect)[]) {
    for (const row of rows) {
      if (regla.condicionPlanes?.length && (!row.plan || !regla.condicionPlanes.includes(row.plan))) continue;
      // origenId incluye el vencimiento exacto: si el cliente renueva y su
      // vencimiento cambia, vuelve a ser elegible para esta misma regla en el
      // ciclo nuevo en vez de quedar bloqueado para siempre por el histórico
      // (mismo mecanismo que plan_proximo_vencer de WhatsApp).
      const disparo = await registrarDisparoReglaCorreo({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${row.vencimiento}`,
        clienteId: row.id,
        patente: row.patente,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue; // ya se disparó esta regla para este ciclo de vencimiento

      try {
        const cliente = clienteFromRow(row);
        const variables = construirVariables({ cliente });
        await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables);
        procesados++;
      } catch (error) {
        console.error("Error disparando regla de correo de vencimiento", regla.id, row.id, error);
        errores++;
      }
    }
  }

  let reglasPorVencer: ReglaCorreo[] = [];
  try {
    reglasPorVencer = await listarReglasCorreoActivas("plan_proximo_vencer");
  } catch (error) {
    console.error("Error cargando reglas de correo (plan_proximo_vencer)", error);
  }
  for (const regla of reglasPorVencer) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    const hastaISO = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
    const rows = await db
      .select()
      .from(clientes)
      .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, ahoraISO), lte(clientes.vencimiento, hastaISO)));
    await dispararParaClientes(regla, rows);
  }

  let reglasVencidos: ReglaCorreo[] = [];
  try {
    reglasVencidos = await listarReglasCorreoActivas("plan_vencido");
  } catch (error) {
    console.error("Error cargando reglas de correo (plan_vencido)", error);
  }
  if (reglasVencidos.length) {
    const desdeISO = new Date(Date.now() - DIAS_VENTANA_PLAN_VENCIDO * MS_POR_DIA).toISOString();
    const rows = await db
      .select()
      .from(clientes)
      .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, desdeISO), lt(clientes.vencimiento, ahoraISO)));
    for (const regla of reglasVencidos) {
      await dispararParaClientes(regla, rows);
    }
  }

  return { procesados, errores };
}
