import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";
import type { FlowStateWhatsapp } from "@/types";
import { clientes } from "./clientes";
import { cupones } from "./cupones";
import { timestamptz } from "./shared";

// Un hilo de conversación por número de WhatsApp (wa_id que manda Meta en
// cada webhook, formato E.164 sin "+"). `clienteId` es opcional: se intenta
// enlazar por teléfono contra `clientes` (ver buscarOCrearConversacion en
// @/lib/dataAccess/whatsapp), pero un número puede escribir sin ser cliente
// todavía. onDelete "set null" porque borrar un cliente no debe borrar su
// historial de conversación, mismo patrón que suscripciones_oneclick.
export const conversacionesWhatsapp = pgTable("conversaciones_whatsapp", {
  id: text("id").primaryKey(),
  telefono: text("telefono").notNull().unique(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  nombreContacto: text("nombre_contacto"),
  // Estado del flujo conversacional de varios pasos en curso (ej. registro +
  // descuento de primera vez, ver manejarPasoRegistroDescuento en
  // @/lib/whatsapp/router) — null cuando no hay ningún flujo a mitad de
  // camino. El bot en general es stateless (cada mensaje se interpreta solo
  // por su texto), esta columna es la única excepción, acotada a flujos que
  // piden varios datos en mensajes sucesivos.
  flowState: jsonb("flow_state").$type<FlowStateWhatsapp>(),
  ultimoMensajeEn: timestamptz("ultimo_mensaje_en").notNull().defaultNow(),
  noLeidos: integer("no_leidos").notNull().default(0),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Mensaje individual dentro de una conversación. `whatsappMessageId` es el
// wamid que devuelve la Graph API al mandar un mensaje (o que trae el webhook
// para uno entrante) — se usa para correlacionar los webhooks de status
// (entregado/leído/fallido) con la fila correspondiente. `estado` solo aplica
// a mensajes salientes; uno entrante queda sin ese dato.
export const mensajesWhatsapp = pgTable(
  "mensajes_whatsapp",
  {
    id: text("id").primaryKey(),
    conversacionId: text("conversacion_id")
      .notNull()
      .references(() => conversacionesWhatsapp.id, { onDelete: "cascade" }),
    direccion: text("direccion").notNull(),
    texto: text("texto").notNull(),
    tipo: text("tipo").notNull().default("texto"),
    estado: text("estado"),
    whatsappMessageId: text("whatsapp_message_id"),
    enviadoPor: text("enviado_por"),
    // Motivo devuelto por la Graph API (o de red) cuando estado="fallido" —
    // sin esto, el único rastro del error quedaba en console.error (logs de
    // Vercel, no consultables desde la base) y diagnosticar un envío
    // rechazado por Meta exigía revisar el dashboard de Vercel a mano.
    error: text("error"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [index("mensajes_whatsapp_conversacion_fecha_idx").on(t.conversacionId, t.creadoEn)]
);

// Catálogo de plantillas de mensaje WhatsApp administrado desde Web Settings
// → WhatsApp Plantillas: mismo patrón/propósito que `plantillas_correo` (ver
// @/db/schema/mail), una fila por situación del proceso de venta/suscripción
// o para ofertas y servicios. NO son plantillas pre-aprobadas de Meta —
// enviarMensajePlantilla (@/lib/whatsapp/enviar) sigue referenciando esas por
// nombre directo contra la Graph API; esto es solo el borrador de contenido
// para cuando se conecte el envío automático.
export const plantillasWhatsapp = pgTable("plantillas_whatsapp", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoria: text("categoria"),
  mensaje: text("mensaje").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  // Nombre/idioma del template ya aprobado en Meta Business Manager que
  // corresponde a esta "situación" — puede ser distinto de `nombre` (que es
  // solo la etiqueta admin). Sin esto, la plantilla queda como borrador de
  // contenido nada más (ver comentario arriba) y no se puede conectar a un
  // envío real vía enviarMensajePlantilla (@/lib/whatsapp/enviar).
  metaNombre: text("meta_nombre"),
  metaIdioma: text("meta_idioma"),
  // Orden de variables (subconjunto de nombre/patente/plan/monto/
  // fechaVencimiento/montoOferta/diasValidez) que calza con los {{1}},{{2}}...
  // posicionales del template aprobado — el admin lo llena una vez para que
  // el motor de reglas (@/lib/whatsapp/reglas) arme los `parametros` en el
  // orden correcto al llamar enviarMensajePlantilla.
  metaVariables: jsonb("meta_variables").$type<string[]>(),
  // Marca MANUAL de que `metaNombre` corresponde a un template realmente
  // aprobado en Meta Business Manager, no solo guardado acá. Editable desde
  // Web Settings → WhatsApp Plantillas.
  //
  // Decía acá que no se podía verificar contra la Graph API porque al token le
  // faltaba el permiso. Es falso: `debug_token` muestra que el token SÍ tiene
  // el scope whatsapp_business_management. Lo que está mal es META_WABA_ID —
  // guarda el App ID (1404535298398587), no el WhatsApp Business Account ID, y
  // por eso GET /{META_WABA_ID}/message_templates responde "(#100) Tried
  // accessing nonexisting field (message_templates)". Corregida esa variable,
  // este flag se puede verificar de verdad contra Meta en vez de a ciegas.
  metaAprobado: boolean("meta_aprobado").notNull().default(false),
});

// Definición de una regla de negocio ("cuándo mandar qué"), editable desde
// Web Settings → Reglas WhatsApp — ver plan de "motor de reglas WhatsApp".
// Reutiliza el catálogo de contenido de `plantillasWhatsapp` (por FK) en vez
// de duplicar texto/variables acá. Se modela como tabla propia (no jsonb en
// ConfigGlobal) porque referencia `plantillaWhatsappId` y crece como entidad
// propia, igual que `cupones`/`servicios`.
export const reglasWhatsapp = pgTable("reglas_whatsapp", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activa: boolean("activa").notNull().default(true),
  // "venta_creada": se evalúa al insertar una Venta nueva (ver
  // evaluarReglasPorVenta). "plan_proximo_vencer": se evalúa en el cron diario
  // escaneando clientes por vencimiento (ver procesarPendientesYVencimientos).
  // "cobro_fallido": se evalúa cuando un cobro Oneclick es rechazado (ver
  // evaluarReglasPorCobroFallido, llamado desde cobrarSuscripcion).
  // "ingreso_plan_registrado": se evalúa al insertar un Ingreso nuevo de un
  // cliente con plan vigente (planEstadoAlIngreso === "ok"), ver
  // evaluarReglasPorIngreso llamado desde dataAccess/ingresos.ts::insertIngresos.
  // "cambio_patente": se evalúa cuando un cambio de patente pendiente
  // (solicitado desde el módulo Clientes, ver clientes.patente_pendiente) se
  // aplica de verdad porque el plan renovó a un período nuevo — ver
  // evaluarReglasPorCambioPatente, llamado desde @/lib/serverActions/clientes.ts::
  // upsertClientes y desde @/lib/pagos/aplicarPagoAprobado.
  // "primer_ingreso_mes": igual disparador que "ingreso_plan_registrado"
  // (mismo filtro planEstadoAlIngreso === "ok"), pero solo en el primer
  // ingreso del cliente dentro del mes calendario — el origenId de su disparo
  // es `${clienteId}:${YYYY-MM}` en vez del id del Ingreso, así el unique de
  // abajo bloquea cualquier ingreso siguiente del mismo cliente en ese mes.
  tipoEvento: text("tipo_evento").notNull(),
  // Solo aplica a tipoEvento="venta_creada": matchea venta.tipo tal cual
  // ("Lavado único", "Plan nuevo", etc.). Null = cualquier tipo de venta.
  condicionTipoVenta: text("condicion_tipo_venta"),
  // Filtro opcional por plan, aplica a ambos tipoEvento. Vacío/null = todos.
  condicionPlanes: jsonb("condicion_planes").$type<string[]>(),
  // Solo aplica a tipoEvento="venta_creada": si true, no dispara para ventas
  // con Venta.viaCupon=true (ej. un "Lavado único" pagado con un cupón de
  // descuento) — evita, por ejemplo, mandar la oferta "contrata tu plan" a
  // quien ya recibió un descuento en esa misma compra. Default false para no
  // cambiar el comportamiento de las reglas existentes.
  condicionExcluirConCupon: boolean("condicion_excluir_con_cupon").notNull().default(false),
  // Solo aplica a tipoEvento="plan_proximo_vencer": cuántos días antes del
  // vencimiento se dispara.
  condicionDiasAntesVencimiento: integer("condicion_dias_antes_vencimiento"),
  // Espejo de condicionPasadasMin en reglasCorreo (ver @/db/schema/mailReglas):
  // minimo de pasadas del ciclo en curso para que la regla dispare. Null = sin
  // filtro. Existe por la politica del ilimitado: al que usa PASES_INCLUIDOS_X5
  // o menos se le MANTIENE el plan, asi que el aviso de "tu plan se termina"
  // solo le corresponde al que se paso del tope.
  condicionPasadasMin: integer("condicion_pasadas_min"),
  // Solo aplica a tipoEvento="venta_creada": días de espera tras la venta
  // antes de mandar (0 = inmediato). En "plan_proximo_vencer" el "cuándo" ya
  // lo define condicionDiasAntesVencimiento.
  delayDias: integer("delay_dias").notNull().default(0),
  // "cupon_descuento": genera un Cupon tipo "descuento" atado a la patente de
  // la venta/cliente (ver @/db/schema/cupones), reconocible automáticamente
  // sin código al volver (ver OperadorFoundResult). "mensaje_simple": solo
  // manda el WhatsApp, sin generar cupón (ej. ofrecer inscripción Oneclick).
  accion: text("accion").notNull(),
  // Solo aplica a accion="cupon_descuento".
  cuponEsPorcentaje: boolean("cupon_es_porcentaje").notNull().default(false),
  cuponValor: numeric("cupon_valor", { mode: "number" }),
  cuponValidezDias: integer("cupon_validez_dias"),
  plantillaWhatsappId: text("plantilla_whatsapp_id")
    .notNull()
    .references(() => plantillasWhatsapp.id),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Registro de cada disparo de una regla — auditoría (qué se mandó y cuándo) e
// idempotencia (evita disparar la misma regla dos veces para el mismo
// origen). `origenId` es el id de la Venta para "venta_creada", el id del
// cobro (`cobrosOneclick.id`/buyOrder) para "cobro_fallido" (así cada intento
// de cobro rechazado dispara su propio aviso), o
// `${clienteId}:${vencimientoISO}` para "plan_proximo_vencer" (así un plan
// renovado con un vencimiento nuevo vuelve a ser elegible). El unique
// (regla_id, origen_tipo, origen_id) es la idempotencia real; `estado` solo
// distingue disparo inmediato ya enviado de uno programado a futuro
// (delayDias > 0) que el cron todavía tiene que procesar.
export const disparosReglaWhatsapp = pgTable(
  "disparos_regla_whatsapp",
  {
    id: text("id").primaryKey(),
    reglaId: text("regla_id")
      .notNull()
      .references(() => reglasWhatsapp.id, { onDelete: "cascade" }),
    origenTipo: text("origen_tipo").notNull(),
    origenId: text("origen_id").notNull(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    patente: text("patente"),
    cuponId: text("cupon_id").references(() => cupones.id, { onDelete: "set null" }),
    mensajeWhatsappId: text("mensaje_whatsapp_id").references(() => mensajesWhatsapp.id, { onDelete: "set null" }),
    estado: text("estado").notNull().default("programado"),
    enviarEn: timestamptz("enviar_en").notNull(),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [unique("disparos_regla_whatsapp_regla_origen_unq").on(t.reglaId, t.origenTipo, t.origenId)]
);

// Opinión del cliente sobre su lavado, capturada por el bot (Opción 6 / QR
// del túnel — ver manejarPasoOpinion en @/lib/whatsapp/router). `nota` es
// escala chilena 1-7 porque es la que un cliente de acá interpreta sin
// explicación; `comentario` solo se pide cuando la nota es baja, así que
// queda null en la mayoría de las filas. Sin FK a `ingresos`: el QR lo
// escanea el cliente con su teléfono y no hay forma confiable de saber a qué
// pasada corresponde — se cruza por cliente_id y fecha si hace falta.
export const opiniones = pgTable(
  "opiniones",
  {
    id: text("id").primaryKey(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    telefono: text("telefono").notNull(),
    nota: integer("nota").notNull(),
    comentario: text("comentario"),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [
    // El bot ya valida 1-7 (parsearNotaOpinion en @/lib/whatsapp/contenido);
    // el check es la red por si mañana entra una opinión por otra vía.
    check("opiniones_nota_rango", sql`${t.nota} between 1 and 7`),
    index("opiniones_creado_en_idx").on(t.creadoEn.desc()),
    index("opiniones_cliente_id_idx").on(t.clienteId),
  ]
);
