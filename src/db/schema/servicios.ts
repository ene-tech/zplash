import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { TamanoVehiculo } from "@/types";
import { timestamptz } from "./shared";

// Catálogo de servicios (fusiona el antiguo listado hardcodeado
// SERVICIOS_ADICIONALES): lo usa tanto ServiciosAdicionalesView (venta rápida
// en el POS) como la Agenda (duracionMinutos define el largo del cupo, igual
// que `procedimientos` en ConsultaPro). El precio NO vive acá — sigue en la
// tabla `precios` genérica, keyed por servicios.id, igual que hoy.
export const servicios = pgTable("servicios", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoria: text("categoria"),
  duracionMinutos: integer("duracion_minutos").notNull().default(30),
  // Minutos por talla S/M/L/XL (Agenda > Servicios); null o 0 = usar duracionMinutos.
  duracionTamano: jsonb("duracion_tamano").$type<Record<TamanoVehiculo, number>>(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
