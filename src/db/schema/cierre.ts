import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { ResumenCierre } from "@/types";
import { timestamptz } from "./shared";

// Cierre de caja diario (ver CierreCaja en @/types): `fecha` es la PK, así que
// la propia base garantiza que un día se cierre una sola vez — cerrar dos
// veces el mismo día (doble clic, dos pestañas) revienta el insert en vez de
// duplicar la fila. No hay update ni delete de esta tabla en ninguna capa: un
// día cerrado no se reabre.
export const cierresCaja = pgTable("cierres_caja", {
  fecha: text("fecha").primaryKey(),
  cerradoPor: text("cerrado_por").notNull(),
  cerradoEn: timestamptz("cerrado_en").notNull().defaultNow(),
  resumen: jsonb("resumen").$type<ResumenCierre>().notNull(),
  notas: text("notas"),
});
