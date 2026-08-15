import "server-only";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { ingresos, precios, ventas } from "@/db/schema";
import { getConfig } from "./config";
import { preciosFromRows } from "./precios";
import { ventaFromRow } from "./ventas";
import { ingresoFromRow } from "./ingresos";
import { calcularOfertasPlan, type OfertaPlan } from "@/lib/helpers";
import type { Cliente } from "@/types";

/**
 * Recalcula, con datos frescos de la base, las promociones de plan
 * elegibles para un cliente puntual — usado por /api/pagos/webpay/crear
 * para nunca confiar en la oferta que el cliente vio en pantalla (pudo
 * quedar vieja: renovó por otra vía, se le pasó la ventana, etc). Mismas
 * consultas que arma /api/cliente/mi-cuenta, pero acotadas a un solo cliente.
 */
export async function calcularOfertasPlanDeCliente(cliente: Cliente): Promise<OfertaPlan> {
  const db = getDb();
  const [ventasRows, ingresosRows, config, preciosRows] = await Promise.all([
    db.select().from(ventas).where(inArray(ventas.clienteId, [cliente.id])),
    db.select().from(ingresos).where(inArray(ingresos.clienteId, [cliente.id])),
    getConfig(),
    db.select().from(precios),
  ]);
  return calcularOfertasPlan(cliente, ventasRows.map(ventaFromRow), ingresosRows.map(ingresoFromRow), config, preciosFromRows(preciosRows));
}
