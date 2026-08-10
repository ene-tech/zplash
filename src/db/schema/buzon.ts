import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

// Filtros del gestor de correo (ver @/types/buzon::ReglaFiltroCorreo) — NO
// son reglas Sieve de servidor: el ManageSieve de Banahost (puerto 4190) no
// es alcanzable desde afuera del propio servidor (confirmado: timeout desde
// Vercel), así que esto corre como un cron propio que evalúa por IMAP (ver
// @/lib/buzon/filtros y /api/correo/filtros/evaluar). `orden` decide en qué
// secuencia se evalúan (igual que un script Sieve de arriba hacia abajo);
// `detenerEvaluacion` equivale al "stop" de Sieve.
export const reglasFiltroCorreo = pgTable("reglas_filtro_correo", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activa: boolean("activa").notNull().default(true),
  orden: integer("orden").notNull().default(0),
  // "todas" (AND) o "cualquiera" (OR) entre las condiciones.
  combinador: text("combinador").notNull().default("todas"),
  condiciones: jsonb("condiciones").$type<{ campo: string; operador: string; valor: string }[]>().notNull().default([]),
  // "mover" | "eliminar" (mueve a Papelera, nunca borra a fuego, ver
  // aplicarFiltrosCorreo) | "marcar_leido".
  accion: text("accion").notNull(),
  carpetaDestino: text("carpeta_destino"),
  detenerEvaluacion: boolean("detener_evaluacion").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
