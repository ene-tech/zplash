import "server-only";

import { config } from "@/db/schema";
import type { ConfigGlobal } from "@/types";
import { CONFIG_DEFAULT, TEXTOS_BOT_WHATSAPP_DEFAULT } from "@/lib/helpers";
import { getDb } from "@/db";
import { upsertRows } from "./shared";

type ConfigRow = typeof config.$inferSelect;

function configToRow(c: ConfigGlobal): typeof config.$inferInsert {
  return {
    id: true,
    horarioOperadorSemanaInicio: c.horarioOperadorSemanaInicio,
    horarioOperadorSemanaFin: c.horarioOperadorSemanaFin,
    horarioOperadorFindeInicio: c.horarioOperadorFindeInicio,
    horarioOperadorFindeFin: c.horarioOperadorFindeFin,
    festivos: c.festivos,
    dotacion: c.dotacion,
    vigenciaDiasPackEmpresa: c.vigenciaDiasPackEmpresa,
    tramosRenovacionLocal: c.tramosRenovacionLocal,
    horasVentanaUpgradePlan: c.horasVentanaUpgradePlan,
    tramosReactivacionVencido: c.tramosReactivacionVencido,
    diasGraciaPagoAtrasado: c.diasGraciaPagoAtrasado,
    horasBloqueoReingresoPlan: c.horasBloqueoReingresoPlan,
    descuentoPrimeraVezValor: c.descuentoPrimeraVezValor,
    descuentoPrimeraVezDiasValidez: c.descuentoPrimeraVezDiasValidez,
    textosBotWhatsapp: c.textosBotWhatsapp as unknown as Record<string, string>,
    firmaCorreo: c.firmaCorreo,
    localLat: c.localLat ?? null,
    localLng: c.localLng ?? null,
    radioAsistenciaMetros: c.radioAsistenciaMetros,
  };
}

export function configFromRow(r: ConfigRow): ConfigGlobal {
  return {
    horarioOperadorSemanaInicio: r.horarioOperadorSemanaInicio,
    horarioOperadorSemanaFin: r.horarioOperadorSemanaFin,
    horarioOperadorFindeInicio: r.horarioOperadorFindeInicio,
    horarioOperadorFindeFin: r.horarioOperadorFindeFin,
    festivos: r.festivos ?? [],
    dotacion: r.dotacion ?? [],
    vigenciaDiasPackEmpresa: r.vigenciaDiasPackEmpresa || 365,
    tramosRenovacionLocal: r.tramosRenovacionLocal ?? {},
    horasVentanaUpgradePlan: r.horasVentanaUpgradePlan || 1,
    tramosReactivacionVencido: r.tramosReactivacionVencido ?? {},
    // `??` y no `||`: 0 días de gracia es una configuración válida (se paga
    // el precio vigente apenas vence), no "todavía sin configurar".
    diasGraciaPagoAtrasado: r.diasGraciaPagoAtrasado ?? 4,
    horasBloqueoReingresoPlan: r.horasBloqueoReingresoPlan || 24.5,
    descuentoPrimeraVezValor: r.descuentoPrimeraVezValor || 1000,
    descuentoPrimeraVezDiasValidez: r.descuentoPrimeraVezDiasValidez || 7,
    textosBotWhatsapp: { ...TEXTOS_BOT_WHATSAPP_DEFAULT, ...(r.textosBotWhatsapp ?? {}) },
    firmaCorreo: r.firmaCorreo ?? "",
    localLat: r.localLat ?? undefined,
    localLng: r.localLng ?? undefined,
    radioAsistenciaMetros: r.radioAsistenciaMetros || 150,
  };
}

/** Lectura directa (sin pasar por loadAll) para el chequeo server-side del bloqueo
 * horario del módulo Operador (ver insertIngresos en @/lib/serverActions) — no confía en el
 * horario que traiga el cliente en AppData, que podría estar desactualizado o alterado. */
export async function getConfig(): Promise<ConfigGlobal> {
  const [row] = await getDb().select().from(config).limit(1);
  return row ? configFromRow(row) : CONFIG_DEFAULT;
}

export async function upsertConfig(cfg: ConfigGlobal): Promise<boolean> {
  try {
    await upsertRows(config, config.id, [configToRow(cfg)]);
    return true;
  } catch (error) {
    console.error("Error guardando configuración", error);
    return false;
  }
}
