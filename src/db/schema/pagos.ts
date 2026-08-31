import { integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { timestamptz } from "./shared";
import { ventas } from "./ventas";

// Ciclo de vida de una transacción Webpay Plus iniciada desde /pagar. A
// diferencia del webhook de WooCommerce (que solo sincroniza pedidos que un
// tercero ya cobró), acá ZPlash es quien habla directo con Transbank: no se
// debe crear una fila en `ventas` hasta que Transaction.commit() confirme el
// pago (response_code === 0) en /api/pagos/webpay/retorno.
export const pagosWebpay = pgTable("pagos_webpay", {
  buyOrder: text("buy_order").primaryKey(), // máx 26 caracteres (límite Transbank)
  sessionId: text("session_id").notNull(),
  patente: text("patente").notNull(),
  // "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" si la compra
  // tenía un solo ítem (se sigue llenando igual que antes, por legibilidad);
  // "carrito" si tenía 2+ ítems — ver desglose en `pagosWebpayItems`.
  tipo: text("tipo").notNull(),
  servicioId: text("servicio_id"), // solo si tipo = "servicio" y la compra tenía un solo ítem
  monto: numeric("monto", { mode: "number" }).notNull(), // monto total cobrado a Transbank (suma de todos los ítems)
  estado: text("estado").notNull().default("iniciada"), // iniciada|aprobada|rechazada|anulada
  token: text("token"),
  authorizationCode: text("authorization_code"),
  responseCode: integer("response_code"),
  // Siempre null desde que existe `pagosWebpayItems`: la venta asociada a
  // cada ítem se registra en `pagosWebpayItems.ventaId`, no acá, para no
  // tener dos fuentes de verdad cuando una compra tiene varios ítems.
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamptz("actualizado_en"),
});

// Desglose por ítem de una transacción Webpay: Transbank solo permite cobrar
// un monto único por buy_order, así que un carrito con varios ítems se cobra
// como una sola transacción (`pagosWebpay.monto` = suma) y acá queda el
// detalle para poder aplicar el efecto de cada ítem por separado en
// /api/pagos/webpay/retorno (extender plan, crear una venta por ítem, etc).
export const pagosWebpayItems = pgTable("pagos_webpay_items", {
  id: text("id").primaryKey(), // `${buyOrder}-${index}`
  buyOrder: text("buy_order")
    .notNull()
    .references(() => pagosWebpay.buyOrder, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" | "pack_empresa"
  servicioId: text("servicio_id"), // solo si tipo = "servicio"
  nombre: text("nombre").notNull(), // snapshot del nombre al momento del cobro
  monto: numeric("monto", { mode: "number" }).notNull(),
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  // Columnas usadas solo cuando tipo = "pack_empresa": llevan el dato de
  // facturación/flota ingresado en el checkout a través del viaje de ida y
  // vuelta a Transbank, hasta que /api/pagos/webpay/retorno los aplica (ver
  // aplicarPagoPackEmpresa en @/lib/pagos).
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  // Email de quien compró — llega desde el checkout, viaja hasta acá igual
  // que el resto de estos campos, y aplicarPagoPackEmpresa lo copia a los
  // cupones/venta resultantes para poder mostrarlos en Mi Cuenta.
  email: text("email"),
  cantidadCupones: integer("cantidad_cupones"),
  patentesAutorizadas: jsonb("patentes_autorizadas").$type<string[]>(),
  // Cupón de descuento aplicado a este ítem (solo ítems de plan, ver
  // TIPOS_PLAN en /api/pagos/webpay/crear): `monto` ya viene rebajado, y este
  // código viaja hasta /retorno para marcar el cupón usado y sellar la venta
  // con viaCupon. Se guarda en vez de volver a buscarlo por patente al
  // retornar, para que quede registrado exactamente cuál se cobró aunque en
  // el intertanto el cliente haya canjeado otro en el túnel.
  cuponCodigo: text("cupon_codigo"),
  // Nombre de lote que el propio cliente le pone a su compra (ej. "Lavados
  // rentacar SALFA Mayo") para reconocerlo después en Mi Cuenta y en el
  // panel B2B/Tickets/Dsctos — si lo deja vacío, aplicarPagoPackEmpresa cae
  // a razonSocial o "Pack Empresa Web" (mismo fallback de siempre).
  nombreLote: text("nombre_lote"),
});

// Ciclo de cobro automático mensual de UNA patente, contra una tarjeta
// inscrita en Oneclick Mall. Una sola fila por patente (índice único en
// `patente`, ver migración 0090), pero varias filas pueden compartir la misma
// tarjeta: el par (username, tbkUser) es lo que identifica la inscripción en
// Transbank y se copia tal cual a los otros autos de la misma persona desde
// "Usar en mis otros autos" en Mi Cuenta. Por eso `username` ya NO es único —
// lo era cuando valía siempre la patente y cada auto obligaba a inscribir la
// tarjeta de nuevo.
//
// Al dar de baja hay que mirar los hermanos: cancelarSuscripcionOneclick solo
// llama al delete de Transbank si es la última fila viva con ese tbkUser.
//
// tokenInscripcion solo se usa mientras está "pendiente" (correlaciona el
// callback de MallInscription.finish con esta fila).
export const suscripcionesOneclick = pgTable("suscripciones_oneclick", {
  id: text("id").primaryKey(),
  patente: text("patente").notNull(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  username: text("username").notNull(),
  email: text("email").notNull(),
  tokenInscripcion: text("token_inscripcion"),
  tbkUser: text("tbk_user"),
  cardTipo: text("card_tipo"),
  cardUltimosDigitos: text("card_ultimos_digitos"),
  // pendiente|pendiente_solo_tarjeta|activa|suspendida|cancelada — la variante
  // "_solo_tarjeta" es igual a "pendiente" salvo que le dice a
  // /inscripcion/retorno que no cobre de inmediato al confirmar (inscripción
  // disparada desde "Mis tarjetas" en Mi Cuenta, no desde /pagar).
  estado: text("estado").notNull().default("pendiente"),
  proximoCobro: timestamptz("proximo_cobro"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamptz("actualizado_en"),
});

// Cada intento de cobro mensual (automático vía cron, primer cobro tras
// inscribir, o manual desde ClienteInfoModal) contra una suscripción activa.
// A propósito NO hay unique(suscripcionId, cicloYm): un ciclo puede tener
// varias filas "rechazada" (reintentos), pero cobrarSuscripcion() en
// @/lib/pagos revisa antes de cobrar que no exista ya una "aprobada" para
// ese ciclo, para no cobrar dos veces un mismo mes.
export const cobrosOneclick = pgTable("cobros_oneclick", {
  id: text("id").primaryKey(), // buyOrder: se usa como parent y child buy_order
  suscripcionId: text("suscripcion_id")
    .notNull()
    .references(() => suscripcionesOneclick.id, { onDelete: "cascade" }),
  cicloYm: text("ciclo_ym").notNull(), // "YYYY-MM"
  monto: numeric("monto", { mode: "number" }).notNull(),
  estado: text("estado").notNull(), // aprobada|rechazada
  responseCode: integer("response_code"),
  authorizationCode: text("authorization_code"),
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
