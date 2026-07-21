import "server-only";

import { config } from "@/db/schema";
import type { ConfigGlobal } from "@/types";
import { CONFIG_DEFAULT } from "@/lib/helpers";
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
    vigenciaDiasPackEmpresa: c.vigenciaDiasPackEmpresa,
    tramosRenovacionLocal: c.tramosRenovacionLocal,
  };
}

export function configFromRow(r: ConfigRow): ConfigGlobal {
  return {
    horarioOperadorSemanaInicio: r.horarioOperadorSemanaInicio,
    horarioOperadorSemanaFin: r.horarioOperadorSemanaFin,
    horarioOperadorFindeInicio: r.horarioOperadorFindeInicio,
    horarioOperadorFindeFin: r.horarioOperadorFindeFin,
    festivos: r.festivos ?? [],
    vigenciaDiasPackEmpresa: r.vigenciaDiasPackEmpresa || 365,
    tramosRenovacionLocal: r.tramosRenovacionLocal ?? {},
  };
}

/** Lectura directa (sin pasar por loadAll) para el chequeo server-side del bloqueo
 * horario del módulo Operador (ver insertIngresos en @/lib/db) — no confía en el
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
