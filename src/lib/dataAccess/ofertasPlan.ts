import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { ingresos, precios, ventas } from "@/db/schema";
import { getConfig } from "./config";
import { preciosFromRows } from "./precios";
import { ventaFromRow } from "./ventas";
import { ingresoFromRow } from "./ingresos";
import { calcularOfertasPlan, type OfertaPlan } from "@/lib/helpers";
import type { Cliente, ConfigGlobal, Precios } from "@/types";

/**
 * Recalcula, con datos frescos de la base, las promociones de plan
 * elegibles para un cliente puntual — usado por /api/pagos/webpay/crear
 * para nunca confiar en la oferta que el cliente vio en pantalla (pudo
 * quedar vieja: renovó por otra vía, se le pasó la ventana, etc). Mismas
 * consultas que arma /api/cliente/mi-cuenta, pero acotadas a un solo cliente.
 *
 * `yaLeidos` deja pasar la config y los precios que el llamador ya trajo, para
 * no releerlos: /api/pagos/estado es público y consulta ambos antes de llegar
 * acá, así que sin esto cada lookup de una patente sin plan vigente hacía dos
 * consultas repetidas. Las ventas y los ingresos del cliente se leen siempre —
 * son justamente el dato fresco por el que se llama a esta función.
 */
export async function calcularOfertasPlanDeCliente(
  cliente: Cliente,
  yaLeidos: { config?: ConfigGlobal; precios?: Precios } = {}
): Promise<OfertaPlan> {
  const db = getDb();
  const [ventasRows, ingresosRows, config, preciosMap] = await Promise.all([
    db.select().from(ventas).where(inArray(ventas.clienteId, [cliente.id])),
    db.select().from(ingresos).where(inArray(ingresos.clienteId, [cliente.id])),
    yaLeidos.config ?? getConfig(),
    yaLeidos.precios ?? db.select().from(precios).then(preciosFromRows),
  ]);
  return calcularOfertasPlan(cliente, ventasRows.map(ventaFromRow), ingresosRows.map(ingresoFromRow), config, preciosMap);
}
