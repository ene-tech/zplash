// Gestor de correo (Bandeja de entrada de info@zplash.cl u otra cuenta del
// mismo buzón) — a diferencia de @/types/mail (PlantillaCorreo, solo
// editor de contenido, sin envío real todavía), este dominio sí lee y envía
// correo real por IMAP/SMTP (ver @/lib/buzon). Nombrado "buzon" y no "mail"
// para no chocar con ese módulo existente.

// Carpeta IMAP tal como la reporta el servidor (ver listarCarpetas en
// @/lib/buzon/leer). `path` es el identificador real a usar en cualquier
// otra llamada (FETCH/APPEND/etc.); `nombre` es solo para mostrar.
export interface CarpetaBuzon {
  path: string;
  nombre: string;
  especial?: "inbox" | "sent" | "drafts" | "trash" | "junk";
}

// Fila liviana para la lista de correos de una carpeta (solo el sobre —
// ENVELOPE/FLAGS — nunca el cuerpo completo, ver listarCorreos).
export interface CorreoResumen {
  uid: number;
  asunto: string;
  de: string;
  deEmail: string;
  fecha: string;
  leido: boolean;
  tieneAdjuntos: boolean;
}

// Metadata de un adjunto — el contenido en sí se pide aparte (ver
// obtenerAdjunto) para no inflar la respuesta de obtenerCorreo con archivos
// grandes que nadie pidió descargar todavía.
export interface AdjuntoCorreo {
  indice: number;
  nombre: string;
  tipo: string;
  tamano: number;
}

export interface CorreoDetalle extends CorreoResumen {
  para: string[];
  cc: string[];
  html?: string;
  texto?: string;
  messageId?: string;
  references: string[];
  adjuntos: AdjuntoCorreo[];
}

export interface AdjuntoDescargado {
  nombre: string;
  tipo: string;
  base64: string;
}

// Payload común para redactar un correo nuevo o responder uno existente (ver
// enviarCorreo en @/lib/buzon/enviar) — inReplyTo/references solo se llenan
// al responder, para que el cliente de correo del destinatario agrupe el
// hilo correctamente.
export interface EnvioCorreo {
  para: string[];
  cc?: string[];
  bcc?: string[];
  asunto: string;
  html: string;
  inReplyTo?: string;
  references?: string[];
}

export interface ResultadoEnvioCorreo {
  ok: boolean;
  error?: string;
}

export type CampoFiltroCorreo = "de" | "para" | "asunto";
export type OperadorFiltroCorreo = "contiene" | "no_contiene";
export type AccionFiltroCorreo = "mover" | "eliminar" | "marcar_leido";

export interface CondicionFiltroCorreo {
  campo: CampoFiltroCorreo;
  operador: OperadorFiltroCorreo;
  valor: string;
}

// Regla de filtrado que corre en el propio servidor de correo (protocolo
// Sieve/ManageSieve, ver @/lib/buzon/sieve) — a diferencia de todo lo demás
// en este dominio, no pasa por IMAP: se aplica a los correos que llegan
// aunque este panel esté cerrado, igual que un filtro de Roundcube/Gmail.
export interface ReglaFiltroCorreo {
  id: string;
  nombre: string;
  activa: boolean;
  // AND ("todas") u OR ("cualquiera") entre las condiciones.
  combinador: "todas" | "cualquiera";
  condiciones: CondicionFiltroCorreo[];
  accion: AccionFiltroCorreo;
  carpetaDestino?: string;
  // Equivale al comando Sieve "stop": si calza esta regla, no se siguen
  // evaluando las que vienen después.
  detenerEvaluacion: boolean;
}

export interface ResultadoFiltrosCorreo {
  revisados: number;
  movidos: number;
  aPapelera: number;
  marcadosLeidos: number;
  error?: string;
}
