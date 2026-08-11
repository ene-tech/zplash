import { numeric, pgTable, text } from "drizzle-orm/pg-core";
import { servicios } from "./servicios";

export const precios = pgTable("precios", {
  plan: text("plan").primaryKey(),
  normal: numeric("normal", { mode: "number" }).notNull().default(0),
  promo: numeric("promo", { mode: "number" }).notNull().default(0),
});

// Precio diferenciado por tamaño de vehículo (S/M/L/XL) para servicios cuyo
// costo depende del tamaño del auto (hoy: Lavado Completo Detailing) —
// separado de `precios` (un solo valor por clave) porque acá un mismo
// servicio necesita 4 precios a la vez. Si un servicio no tiene fila acá, el
// sitio cae al precio flat de `precios` (ver precioServicioTamano en
// lib/helpers/precios.ts): no es obligatorio cargar tamaños para todo el
// catálogo, solo para los servicios donde el tamaño realmente cambia el
// precio. onDelete cascade sigue el mismo criterio que cita_servicios: los
// servicios del catálogo casi nunca se borran de verdad, se desactivan.
export const preciosTamano = pgTable("precios_tamano", {
  servicioId: text("servicio_id")
    .primaryKey()
    .references(() => servicios.id, { onDelete: "cascade" }),
  s: numeric("s", { mode: "number" }).notNull().default(0),
  m: numeric("m", { mode: "number" }).notNull().default(0),
  l: numeric("l", { mode: "number" }).notNull().default(0),
  xl: numeric("xl", { mode: "number" }).notNull().default(0),
});
