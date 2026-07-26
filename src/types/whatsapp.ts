export type DireccionMensajeWhatsapp = "entrante" | "saliente";
export type TipoMensajeWhatsapp = "texto" | "imagen" | "plantilla";
export type EstadoMensajeWhatsapp = "enviado" | "entregado" | "leido" | "fallido";

// Hilo de conversación con un número de WhatsApp — ver comentario en
// @/db/schema/whatsapp sobre el enlace opcional a Cliente.
export interface ConversacionWhatsapp {
  id: string;
  telefono: string;
  clienteId?: string;
  nombreContacto?: string;
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
// @/lib/helpers/whatsapp). La lista de precios (textoPrecios) no es
// editable acá: se genera desde la tabla de precios/servicios real.
export interface TextosBotWhatsapp {
  menuPrincipal: string;
  textoContratarPlan: string;
  horarioUbicacion: string;
  contactoHumano: string;
  mensajeNoEntendido: string;
  patenteNoEncontrada: string;
  textoDescuentoInstrucciones: string;
  textoDescuentoYaCliente: string;
  textoDescuentoPatenteInvalida: string;
  textoDescuentoConfirmacion: string;
}

// Plantilla de contenido (no una plantilla pre-aprobada de Meta, ver
// comentario en @/db/schema/whatsapp) para una situación del proceso de
// venta/suscripción o de ofertas y servicios — editable desde Web Settings →
// WhatsApp Webhooks, mismo patrón que PlantillaCorreo.
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
  // fechaVencimiento, montoOferta, diasValidez.
  metaVariables?: string[];
}

export type TipoEventoReglaWhatsapp = "venta_creada" | "plan_proximo_vencer";
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

export type OrigenTipoDisparoReglaWhatsapp = "venta" | "cliente";
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
