import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { ResumenCierre } from "@/types";
import { timestamptz } from "./shared";

// Cierre de caja diario (ver CierreCaja en @/types): `fecha` es la PK, así que
// la propia base garantiza que un día se cierre una sola vez — cerrar dos
// veces el mismo día (doble clic, dos pestañas) revienta el insert en vez de
// duplicar la fila. Un día cerrado solo se reabre si Gerencia aprueba el
// pedido (ver reabrirCaja), y solo el día de hoy.
export const cierresCaja = pgTable("cierres_caja", {
  fecha: text("fecha").primaryKey(),
  cerradoPor: text("cerrado_por").notNull(),
  cerradoEn: timestamptz("cerrado_en").notNull().defaultNow(),
  resumen: jsonb("resumen").$type<ResumenCierre>().notNull(),
  notas: text("notas"),
  // Pedido de reapertura de quien cerró, para que Gerencia lo apruebe (ver
  // solicitarReaperturaCaja/reabrirCaja). Aprobar borra la fila entera.
  reaperturaSolicitadaPor: text("reapertura_solicitada_por"),
  reaperturaSolicitadaEn: timestamptz("reapertura_solicitada_en"),
  reaperturaMotivo: text("reapertura_motivo"),
});
