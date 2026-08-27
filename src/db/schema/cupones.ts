import { boolean, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

export const cupones = pgTable("cupones", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombreLote: text("nombre_lote").notNull(),
  valor: numeric("valor", { mode: "number" }).notNull().default(0),
  numeroLote: integer("numero_lote").notNull().default(1),
  totalLote: integer("total_lote").notNull().default(1),
  fechaCaducidad: timestamptz("fecha_caducidad").notNull(),
  usado: boolean("usado").notNull().default(false),
  patenteUso: text("patente_uso"),
  fechaUso: timestamptz("fecha_uso"),
  operadorUso: text("operador_uso"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
  // "vale" (comportamiento original: lavado 100% gratis al canjear) vs
  // "descuento" (resta `valor` del precio a cobrar; ver bot de WhatsApp).
  tipo: text("tipo").notNull().default("vale"),
  // Patente a la que se le asignó el cupón *antes* de usarse (distinto de
  // patenteUso, que se llena recién al canjear). Solo aplica a "descuento".
  patenteAsignada: text("patente_asignada"),
  // Solo aplica a "descuento": true = `valor` es un % (0-100), false = monto fijo en CLP.
  esPorcentaje: boolean("es_porcentaje").notNull().default(false),
  // RUT de la empresa dueña del lote (packs empresa comprados por web o
  // generados manualmente en B2B/Tickets con Factura) — permite la consulta
  // pública de tickets por RUT en /api/empresa/tickets. Null en cupones que
  // no pertenecen a una empresa (ej. descuentos individuales del bot).
  rut: text("rut"),
  // Solo aplica a tipo "vale" de un pack empresa: lista de patentes de la
  // flota autorizadas a canjear cualquiera de los tickets del lote. Null o
  // vacío = lote abierto, cualquier patente puede canjear (comportamiento
  // original de "vale").
  patentesAutorizadas: jsonb("patentes_autorizadas").$type<string[]>(),
  // Regla opcional del lote: cada patente puede canjear un solo cupón del
  // lote. Se usa en packs de cortesía o de un evento publicitario, donde el
  // objetivo es que la promoción llegue a clientes distintos y no la queme
  // entera un mismo auto. Default false para no cambiar el comportamiento de
  // los lotes ya generados (y de los packs empresa, donde la flota sí puede
  // canjear varios tickets con la misma patente).
  unCuponPorPatente: boolean("un_cupon_por_patente").notNull().default(false),
  // Solo aplica a "descuento": el código no se quema en el primer canje —
  // cada patente puede usarlo una vez y queda vigente hasta caducar. Se usa
  // en promos abiertas que circulan públicas (redes sociales, volantes).
  // Default false = un solo uso global, el comportamiento original.
  unUsoPorPatente: boolean("un_uso_por_patente").notNull().default(false),
  // Patentes que ya canjearon el descuento cuando unUsoPorPatente está en
  // true. Reemplaza a usado/patenteUso en ese modo: un código reutilizable no
  // tiene UNA patente de uso ni queda "usado". Null = todavía nadie.
  patentesUsadas: jsonb("patentes_usadas").$type<string[]>(),
  // Solo aplica a "descuento": lo puede canjear únicamente una patente sin
  // ficha de cliente (misma definición de "nuevo" que el descuento de
  // bienvenida de la landing). Default false = cualquier patente.
  soloClientesNuevos: boolean("solo_clientes_nuevos").notNull().default(false),
  // Email de quien compró el Pack Empresa por web — permite mostrar los
  // tickets en Mi Cuenta (portal cliente) buscando por el correo de la
  // sesión, sin depender de que el comprador recuerde el RUT. Null en
  // cupones que no vienen de una compra web con email (generados a mano en
  // B2B/Tickets/Dsctos, o descuentos individuales del bot).
  email: text("email"),
});
