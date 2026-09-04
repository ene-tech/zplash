import { boolean, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./shared";

export const clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  patente: text("patente").notNull().unique(),
  telefono: text("telefono"),
  email: text("email"),
  vehiculo: text("vehiculo"),
  plan: text("plan"),
  // Fecha hasta la cual (inclusive, ver sigueVigenteHoy) este cliente conserva
  // los lavados SIN TOPE del ilimitado viejo aunque `plan` ya diga Plan X5:
  // renovó antes de vencer, así que pagó el X5 por adelantado pero el mes que
  // ya tenía comprado se le respeta como se lo vendieron (ver planVigente e
  // ilimitadoHastaAlRenovar en @/lib/helpers/precios). null = el plan de la
  // columna rige desde siempre, que es el caso de todo cliente que no venga
  // del ilimitado viejo.
  ilimitadoHasta: timestamptz("ilimitado_hasta"),
  // Momento en que el cliente del ilimitado viejo ACEPTÓ pasar al Plan X5:
  // alguien apretó, con el aviso a la vista, un botón que dice "Contratar Plan
  // X5" — el cliente en la web o en Mi Cuenta, o el operador en el mesón. Lo
  // escriben esos caminos interactivos (ver /api/pagos/oneclick/inscribir,
  // /api/cliente/mi-cuenta/cobrar-oferta y aceptarPasoAX5); el cron de cobro
  // automático NO lo escribe nunca, y por eso es el único camino que queda
  // bloqueado (ver requiereValidacionX5 y cobrarSuscripcion).
  //
  // Existe porque hasta ago-2026 toda renovación lo pasaba al X5 sin que el
  // cliente eligiera nada, incluso cobrándole la tarjeta inscrita sin que
  // viera una pantalla: 150 clientes migrados así.
  aceptoX5En: timestamptz("acepto_x5_en"),
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  vencimiento: timestamptz("vencimiento"),
  // Patente solicitada para reemplazar la actual, que recién se aplica cuando
  // el plan vigente renueva a un período nuevo (ver resolverPatentePendiente
  // en @/lib/helpers/clientes y su uso en dataAccess/clientes.ts::upsertClientes
  // y en @/lib/pagos/aplicarPagoAprobado) — hasta entonces `patente` sigue
  // siendo la registrada, para no perder validez de ingreso a mitad de mes.
  patentePendiente: text("patente_pendiente"),
  patentePendienteDesde: timestamptz("patente_pendiente_desde"),
  fechaContratacion: timestamptz("fecha_contratacion"),
  // Seteado por el webhook de suscripción de WooCommerce (ver
  // /api/webhooks/woocommerce/suscripcion) cuando WooCommerce Subscriptions
  // avisa que la suscripción de este cliente pasó a "cancelled"/"expired".
  // El webhook de pedidos (/api/webhooks/woocommerce) lo consulta: si hay un
  // pedido nuevo para este cliente y esta marca está seteada, ese pedido es
  // una recontratación (fechaContratacion y vencimiento se reinician), no una
  // renovación más del ciclo anterior — y la marca se limpia. Sin esto, un
  // cliente que cancela y vuelve a contratar quedaba indistinguible de uno
  // que nunca canceló, y el vencimiento seguía apilándose sobre el ciclo
  // viejo.
  suscripcionCanceladaEn: timestamptz("suscripcion_cancelada_en"),
  // Seteado por el webhook de pedidos de WooCommerce (ver ../route.ts) cuando
  // un pedido trae created_via = "subscription" — evidencia real de que la
  // renovación mensual de este cliente la sigue cobrando automáticamente
  // WooCommerce Subscriptions + Transbank Oneclick Mall (el sistema viejo),
  // no el Oneclick propio de esta app (ver suscripcionesOneclick). Se limpia
  // a null cuando el webhook de suscripción marca suscripcionCanceladaEn.
  // Solo se usa para mostrarle esto al cliente en Mi Cuenta (de solo lectura
  // — gestionar/cancelar esa suscripción todavía requiere WhatsApp/WooCommerce
  // mientras la migración de las suscripciones activas siga en curso).
  renovacionAutoWooDesde: timestamptz("renovacion_auto_woo_desde"),
  // Precio heredado del plan: lo que este cliente venía pagando antes de un
  // alza, respetado mientras renueve ANTES de que se le venza (ver
  // precioConHeredado en @/lib/helpers/precios). null = paga el precio
  // vigente, que es el caso de todo cliente nuevo. Se cargó por única vez con
  // scripts/backfill-precio-plan-heredado.ts para los clientes que venían de
  // WooCommerce a $19.990 cuando el plan pasó a $21.990; de ahí en adelante
  // es un campo que se setea a mano si hace falta grandfatherear a alguien.
  precioPlanHeredado: integer("precio_plan_heredado"),
  // true = a este cliente no se le manda ninguna plantilla automática: las
  // reglas de WhatsApp y las de correo lo saltan (ver ejecutarAccionRegla y
  // ejecutarAccionReglaCorreo). Se marca desde la ficha del cliente en el
  // Operador, para el que pide "no me manden más mensajes" sin tener que
  // apagarle la regla a todos. Opt-out (default false) y no opt-in: nadie
  // queda mudo por un camino de escritura que no conozca el campo. Los envíos
  // manuales (código desde la ficha, chat, ticket de reactivación) siguen.
  sinComunicacionAuto: boolean("sin_comunicacion_auto").notNull().default(false),
  origen: text("origen").notNull().default("LOCAL"),
  visitas: integer("visitas").notNull().default(0),
  ultimaVisita: timestamptz("ultima_visita"),
  ultimaRenovacion: timestamptz("ultima_renovacion"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Aceptación de las "Políticas de Funcionamiento y Garantía" (ver
// @/lib/politicas) por parte de una cuenta del Portal Cliente. Va por email
// y no por cliente/patente porque clientes.email no es único — un mismo
// correo resuelve a varias filas de `clientes` (ver buscarClientesPorEmail)
// y quien acepta es la persona, no cada vehículo. Se guarda en minúscula
// (ver aceptoPoliticas en @/lib/dataAccess/clientes), por lo mismo que esa
// búsqueda compara case-insensitive.
//
// La PK compuesta (email, version) es a propósito: cada versión aceptada
// queda como una fila propia, así subir POLITICAS_VERSION vuelve a pedir la
// aceptación sin borrar la evidencia de haber aceptado la anterior.
export const politicasAceptadas = pgTable(
  "politicas_aceptadas",
  {
    email: text("email").notNull(),
    version: text("version").notNull(),
    aceptadoEn: timestamptz("aceptado_en").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.email, t.version] })]
);
