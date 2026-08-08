export type DireccionMensajeWhatsapp = "entrante" | "saliente";
export type TipoMensajeWhatsapp = "texto" | "imagen" | "plantilla";
export type EstadoMensajeWhatsapp = "enviado" | "entregado" | "leido" | "fallido";

// Estado de un flujo conversacional de varios pasos en curso — ver
// manejarPasoRegistroDescuento (registro + descuento de primera vez, Opción
// 5) y manejarPasoCambioPatente (invitado tras una consulta de patente
// exitosa) en @/lib/whatsapp/router.
export interface FlowStateWhatsapp {
  tipo: "registro_descuento" | "cambio_patente";
  paso: "nombre" | "patente" | "mail" | "nueva_patente";
  nombre?: string;
  patente?: string;
}

// Hilo de conversación con un número de WhatsApp — ver comentario en
// @/db/schema/whatsapp sobre el enlace opcional a Cliente.
export interface ConversacionWhatsapp {
  id: string;
  telefono: string;
  clienteId?: string;
  nombreContacto?: string;
  flowState?: FlowStateWhatsapp | null;
  ultimoMensajeEn: string;
  noLeidos: number;
  creadoEn: string;
}

export interface MensajeWhatsapp {
  id: string;
  conversacionId: string;
  direccion: DireccionMensajeWhatsapp;
  texto: string;
  tipo: TipoMensajeWhatsapp;
  estado?: EstadoMensajeWhatsapp;
  whatsappMessageId?: string;
  enviadoPor?: string;
  // Motivo devuelto por la Graph API (o de red) cuando estado="fallido".
  error?: string;
  creadoEn: string;
}

// Contenido editable de las respuestas automáticas del bot de WhatsApp (ver
// @/lib/whatsapp/router y @/lib/whatsapp/contenido) — vive dentro de
// ConfigGlobal.textosBotWhatsapp, editable desde Web Settings → Menú Bot
// WhatsApp. A diferencia de PlantillaWhatsapp (catálogo abierto, sin
// conectar todavía), estos son campos fijos: cada uno está atado a una rama
// específica del router del bot. textoDescuentoInstrucciones acepta
// {{monto}}/{{dias}}; textoDescuentoConfirmacion acepta
// {{codigo}}/{{monto}}/{{fecha}} (ver aplicarVariables en
// @/lib/helpers/whatsapp). textoDescuentoPedirNombre/PedirPatente/PedirMail
// son los 3 pasos del flujo de registro de la Opción 5 (ver
// manejarPasoRegistroDescuento en @/lib/whatsapp/router);
// textoDescuentoPatenteInvalida/textoDescuentoMailInvalido se repiten como
// reintento si el dato no pasa la validación, sin avanzar de paso.
// textoPreciosIntro es solo el encabezado que
// antecede a la lista de precios/servicios: la lista en sí siempre se
// genera desde la tabla real, no es editable como texto libre. Los campos
// patenteEstado* arman, línea por línea, el mensaje de consulta de
// patente (ver estadoPlanPorPatente en @/lib/whatsapp/router):
// patenteEstadoEncabezado acepta {{patente}}/{{nombre}}; patenteEstadoPlan
// acepta {{plan}} (que ya viene resuelto a patenteEstadoPlanVacio si el
// cliente no tiene plan); patenteEstadoLinea acepta {{estado}};
// patenteEstadoVencimiento acepta {{fecha}}; patenteEstadoAvisoPorVencer
// acepta {{dias}}. La etiqueta de estado en sí ("Vigente"/"Por
// vencer"/"Vencido"/"Sin plan") viene de planStatus() en
// @/lib/helpers/clientes y no es editable acá porque también se usa en
// insignias de estado del cliente fuera del bot. patenteEstadoCambioInvitacion
// es la línea que se agrega al final de una consulta de patente exitosa,
// invitando a escribir "cambio de patente" (ver iniciarCambioPatente en
// @/lib/whatsapp/router); los textoCambioPatente* son el flujo de un solo
// paso que sigue — mismo mecanismo diferido (patentePendiente) que
// solicitarCambioPatente en @/lib/serverActions/clientes, solo que iniciado por el
// propio cliente desde el bot. textoCambioPatenteConfirmacion acepta
// {{patente}}.
export interface TextosBotWhatsapp {
  menuPrincipal: string;
  textoPreciosIntro: string;
  textoContratarPlan: string;
  horarioUbicacion: string;
  contactoHumano: string;
  mensajeNoEntendido: string;
  patenteNoEncontrada: string;
  textoDescuentoInstrucciones: string;
  textoDescuentoPedirNombre: string;
  textoDescuentoPedirPatente: string;
  textoDescuentoPedirMail: string;
  textoDescuentoMailInvalido: string;
  textoDescuentoYaCliente: string;
  textoDescuentoPatenteInvalida: string;
  textoDescuentoConfirmacion: string;
  patenteEstadoEncabezado: string;
  patenteEstadoPlan: string;
  patenteEstadoPlanVacio: string;
  patenteEstadoLinea: string;
  patenteEstadoVencimiento: string;
  patenteEstadoAvisoPorVencer: string;
  patenteEstadoAvisoVencido: string;
  patenteEstadoCambioInvitacion: string;
  textoCambioPatenteSinCliente: string;
  textoCambioPatentePedirNueva: string;
  textoCambioPatenteInvalida: string;
  textoCambioPatenteEsLaMisma: string;
  textoCambioPatenteYaExiste: string;
  textoCambioPatenteConfirmacion: string;
}

// Plantilla de contenido (no una plantilla pre-aprobada de Meta, ver
// comentario en @/db/schema/whatsapp) para una situación del proceso de
// venta/suscripción o de ofertas y servicios — editable desde Web Settings →
// WhatsApp Plantillas, mismo patrón que PlantillaCorreo.
export interface PlantillaWhatsapp {
  id: string;
  nombre: string;
  categoria?: string;
  mensaje: string;
  activo: boolean;
  // Nombre/idioma del template ya aprobado en Meta Business Manager que
  // corresponde a esta situación (ver @/db/schema/whatsapp) — sin esto la
  // plantilla queda solo como borrador de contenido, no conectable a un envío
  // real vía enviarMensajePlantilla.
  metaNombre?: string;
  metaIdioma?: string;
  // Orden de variables que calza con los {{1}},{{2}}... posicionales del
  // template aprobado. Subconjunto de: nombre, patente, plan, monto,
  // fechaVencimiento, fechaVencimientoOferta, montoOferta, montoDescuento,
  // montoAPagar, diasValidez, patenteAnterior (patente y patenteAnterior solo
  // difieren en tipoEvento="cambio_patente", ver construirVariables en
  // @/lib/whatsapp/reglas). montoDescuento/montoAPagar solo se llenan si el
  // envío indica un precio base (ver enviarMensajesMasivosWhatsapp en
  // @/lib/whatsapp/masivo) — sin eso, montoOferta sigue siendo la única
  // variable disponible para mostrar el valor del cupón. fechaVencimiento es
  // el vencimiento del PLAN del cliente (vacío si no tiene uno, ej. clientes
  // sin plan) — fechaVencimientoOferta es hoy + diasValidez, la fecha límite
  // de la oferta del mensaje en sí, no depende de que el cliente tenga plan.
  metaVariables?: string[];
  // Marca manual de que metaNombre corresponde a un template realmente
  // aprobado en Meta (ver comentario en @/db/schema/whatsapp).
  metaAprobado: boolean;
}

export type TipoEventoReglaWhatsapp =
  | "venta_creada"
  | "plan_proximo_vencer"
  | "cobro_fallido"
  | "ingreso_plan_registrado"
  | "cambio_patente"
  | "primer_ingreso_mes";
export type AccionReglaWhatsapp = "cupon_descuento" | "mensaje_simple";

// Regla de negocio ("cuándo mandar qué") — ver plan de "motor de reglas
// WhatsApp" y comentario en @/db/schema/whatsapp. Editable desde Web
// Settings → Reglas WhatsApp.
export interface ReglaWhatsapp {
  id: string;
  nombre: string;
  activa: boolean;
  tipoEvento: TipoEventoReglaWhatsapp;
  condicionTipoVenta?: string;
  condicionPlanes?: string[];
  condicionDiasAntesVencimiento?: number;
  delayDias: number;
  accion: AccionReglaWhatsapp;
  cuponEsPorcentaje?: boolean;
  cuponValor?: number;
  cuponValidezDias?: number;
  plantillaWhatsappId: string;
  creadoEn: string;
  creadoPor?: string;
}

export type OrigenTipoDisparoReglaWhatsapp = "venta" | "cliente" | "cobro" | "ingreso";
export type EstadoDisparoReglaWhatsapp = "programado" | "enviado" | "error";

// Auditoría + idempotencia de cada disparo de una ReglaWhatsapp — ver
// comentario en @/db/schema/whatsapp.
export interface DisparoReglaWhatsapp {
  id: string;
  reglaId: string;
  origenTipo: OrigenTipoDisparoReglaWhatsapp;
  origenId: string;
  clienteId?: string;
  patente?: string;
  cuponId?: string;
  mensajeWhatsappId?: string;
  estado: EstadoDisparoReglaWhatsapp;
  enviarEn: string;
  creadoEn: string;
}

// Fila enriquecida para el historial de envíos (Web Settings → Historial
// WhatsApp) — join de disparosReglaWhatsapp con reglasWhatsapp, clientes y
// mensajesWhatsapp, de solo lectura (no tiene su propio dataAccess de
// escritura). `mensajeTexto` trae "[Plantilla: nombre]" tal cual lo guarda
// enviarMensajePlantilla en @/lib/whatsapp/enviar.
export interface HistorialReglaWhatsapp {
  id: string;
  creadoEn: string;
  reglaNombre: string;
  origenTipo: OrigenTipoDisparoReglaWhatsapp;
  patente?: string;
  clienteNombre?: string;
  estado: EstadoDisparoReglaWhatsapp;
  mensajeTexto?: string;
  mensajeEstado?: EstadoMensajeWhatsapp;
  mensajeError?: string;
}

// Resultado de un envío masivo manual (Web Settings → Mensajes Únicos, ver
// @/lib/whatsapp/masivo) — a diferencia de ReglaWhatsapp/DisparoReglaWhatsapp
// (motor de eventos, con su propia tabla de auditoría) este es un envío
// puntual disparado a mano por un admin a un grupo de clientes filtrado en el
// momento, así que no queda fila de "campaña" propia: el resultado se
// muestra una sola vez en la UI justo después de enviar, y cada mensaje
// individual sigue quedando igual en mensajes_whatsapp (visible en la
// conversación del cliente respectivo).
export interface ResultadoEnvioMasivoWhatsapp {
  total: number;
  enviados: number;
  fallidos: number;
  sinTelefono: number;
  // true si accion="cupon_descuento" y el lote de cupones no se pudo guardar
  // (ver enviarMensajesMasivosWhatsapp en @/lib/whatsapp/masivo) — en ese caso
  // no se envió ningún mensaje del lote, a diferencia de `fallidos` normal
  // (que sí intentó el envío contra la Graph API).
  cuponError?: boolean;
}
