import "server-only";

import { and, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import {
  listarDisparosProgramadosVencidos,
  listarReglasWhatsappActivas,
  marcarDisparoReglaWhatsapp,
  obtenerReglaWhatsapp,
  registrarDisparoReglaWhatsapp,
} from "@/lib/dataAccess/whatsapp";
import { uid } from "@/lib/helpers";
import { buscarCliente, ejecutarAccionRegla, MS_POR_DIA } from "./motor";
import type { DisparoReglaWhatsapp, ReglaWhatsapp } from "@/types";

// Llamado por el cron diario (/api/whatsapp/reglas/evaluar): (1) procesa
// disparos "venta_creada" con delayDias > 0 cuya fecha ya llegó, generando
// recién ahí el Cupon (para que los días de validez cuenten desde que el
// cliente recibe el mensaje, no desde la compra); (2) evalúa reglas
// "plan_proximo_vencer" escaneando clientes por vencimiento.
export async function procesarPendientesYVencimientos(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  const ahoraISO = new Date().toISOString();

  let pendientes: DisparoReglaWhatsapp[] = [];
  try {
    pendientes = await listarDisparosProgramadosVencidos(ahoraISO);
  } catch (error) {
    console.error("Error listando disparos programados de WhatsApp", error);
  }
  for (const disparo of pendientes) {
    try {
      const regla = await obtenerReglaWhatsapp(disparo.reglaId);
      const cliente = disparo.clienteId ? await buscarCliente(disparo.clienteId) : null;
      if (!regla || !cliente) {
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" });
        errores++;
        continue;
      }
      await ejecutarAccionRegla(regla, disparo.id, cliente);
      procesados++;
    } catch (error) {
      console.error("Error procesando disparo programado de WhatsApp", disparo.id, error);
      await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
      errores++;
    }
  }

  let reglasVencimiento: ReglaWhatsapp[] = [];
  try {
    reglasVencimiento = await listarReglasWhatsappActivas("plan_proximo_vencer");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (plan_proximo_vencer)", error);
  }
  for (const regla of reglasVencimiento) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    const hastaISO = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
    const clientesRows = await getDb()
      .select()
      .from(clientes)
      .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, ahoraISO), lte(clientes.vencimiento, hastaISO)));

    for (const row of clientesRows) {
      if (regla.condicionPlanes?.length && (!row.plan || !regla.condicionPlanes.includes(row.plan))) continue;
      // origenId incluye el vencimiento exacto: si el cliente renueva y su
      // vencimiento cambia, vuelve a ser elegible para esta misma regla en el
      // ciclo nuevo en vez de quedar bloqueado para siempre por el histórico.
      const disparo = await registrarDisparoReglaWhatsapp({
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
        await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(row));
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp de vencimiento", regla.id, row.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }

  return { procesados, errores };
}
