// Plantilla de correo para una situación del proceso de venta/suscripción
// (confirmación de compra, pago rechazado, vencimiento próximo, etc.) o para
// comunicación de ofertas y servicios — contenido editable desde Web
// Settings → Mail Templates, mismo patrón de catálogo que Servicio. El envío
// automático lo conecta ReglaCorreo (ver más abajo) apuntando a una de estas
// por id.
export interface PlantillaCorreo {
  id: string;
  nombre: string;
  categoria?: string;
  asunto: string;
  cuerpo: string;
  activo: boolean;
}

// "venta_creada_presencial": mismo momento que "venta_creada" (se evalúa
// junto en evaluarReglasCorreoPorVenta), pero solo para ventas que NO son
// automáticas/web (ver esTarjetaWeb en @/lib/helpers/ventas, basado en
// Venta.creadoPor) — para reglas que no tiene sentido disparar en una
// renovación automática Oneclick o un pedido WooCommerce, ej. una invitación
// que un operador entrega en persona.
// "envio_manual": no la evalúa ningún hook ni el cron — la crea sola
// obtenerOCrearReglaEnvioManual (@/lib/dataAccess/mail) la primera vez que se
// manda una PlantillaCorreo desde Web Settings → Correos Únicos, una por
// plantilla. Existe como ReglaCorreo por el mismo motivo que
// "migracion_woo_legacy": disparos_regla_correo.regla_id es NOT NULL, así que
// es la vía para reusar la tabla de disparos (auditoría en Historial Correo +
// idempotencia) sin migrar el esquema. Nace con activa=false para que se lea
// de un vistazo, en la lista de Reglas Correo, que no dispara sola.
export type TipoEventoReglaCorreo =
  | "venta_creada"
  | "venta_creada_presencial"
  | "plan_proximo_vencer"
  | "plan_vencido"
  | "cobro_fallido"
  | "migracion_woo_legacy"
  | "tope_ilimitado_superado"
  // "suscripcion_cancelada": el respaldo por escrito de que ya no se le va a
  // cobrar más. La disparan los dos caminos por los que se corta el cobro
  // automático: anularSuscripcion (@/lib/serverActions/oneclick, botón
  // "Cancelar suscripción" de la ficha) y /api/cliente/mi-cuenta/eliminar-tarjeta
  // (el cliente dándose de baja solo desde Mi Cuenta).
  | "suscripcion_cancelada"
  | "envio_manual";

// Regla de negocio ("cuándo mandar qué correo") — motor en paralelo al de
// WhatsApp (ver ReglaWhatsapp en @/types/whatsapp y comentario en
// @/db/schema/mailReglas sobre por qué no comparten tabla). Editable desde
// Web Settings → Reglas Correo.
export interface ReglaCorreo {
  id: string;
  nombre: string;
  activa: boolean;
  tipoEvento: TipoEventoReglaCorreo;
  condicionTipoVenta?: string;
  condicionPlanes?: string[];
  condicionDiasAntesVencimiento?: number;
  // Solo aplica a tipoEvento="plan_proximo_vencer" — ver comentario en
  // @/db/schema/mailReglas.
  condicionSoloSinAutopago?: boolean;
  // Solo aplica a tipoEvento="plan_proximo_vencer": manda el correo únicamente
  // a quien tenga promoción de renovación anticipada vigente por el canal Web
  // — ver comentario en @/db/schema/mailReglas.
  condicionSoloConPromoRenovacion?: boolean;
  // Solo aplica a tipoEvento="plan_vencido" — ver comentario en
  // @/db/schema/mailReglas.
  condicionDiasDespuesVencimiento?: number;
  // Solo aplica a tipoEvento="plan_vencido": tope de pasadas del último período
  // pagado para que la regla dispare — ver comentario en @/db/schema/mailReglas.
  condicionPasadasMax?: number;
  condicionPasadasMin?: number;
  delayDias: number;
  plantillaCorreoId: string;
  creadoEn: string;
  creadoPor?: string;
}

export type OrigenTipoDisparoReglaCorreo = "venta" | "cliente" | "cobro";
export type EstadoDisparoReglaCorreo = "programado" | "enviado" | "error";

// Auditoría + idempotencia de cada disparo de una ReglaCorreo — ver
// comentario en @/db/schema/mailReglas.
export interface DisparoReglaCorreo {
  id: string;
  reglaId: string;
  origenTipo: OrigenTipoDisparoReglaCorreo;
  origenId: string;
  clienteId?: string;
  patente?: string;
  estado: EstadoDisparoReglaCorreo;
  error?: string;
  enviarEn: string;
  creadoEn: string;
}

// Fila enriquecida para el historial de envíos (Web Settings → Historial
// Correo) — join de disparosReglaCorreo con reglasCorreo y clientes, de solo
// lectura, mismo propósito que HistorialReglaWhatsapp.
export interface HistorialReglaCorreo {
  id: string;
  creadoEn: string;
  reglaNombre: string;
  origenTipo: OrigenTipoDisparoReglaCorreo;
  patente?: string;
  clienteNombre?: string;
  estado: EstadoDisparoReglaCorreo;
  error?: string;
}

export type EstadoCorreoAutomatico = "enviado" | "error";

// Fila liviana de la bandeja de salida del remitente automático (Correo →
// Salida automática) — el sobre, sin el HTML del cuerpo, mismo criterio que
// CorreoResumen en @/types/buzon: la lista puede traer cientos de correos y
// el cuerpo se pide aparte al abrir uno (ver CorreoAutomatico).
export interface CorreoAutomaticoResumen {
  id: string;
  de: string;
  para: string;
  asunto: string;
  estado: EstadoCorreoAutomatico;
  error?: string;
  clienteNombre?: string;
  creadoEn: string;
}

// El correo completo, con el HTML ya renderizado tal como le llegó al
// destinatario (variables resueltas, diseño de envolverCorreoBase aplicado).
export interface CorreoAutomatico extends CorreoAutomaticoResumen {
  html: string;
  proveedorId?: string;
}

// Resultado de la campaña de migración WooCommerce→Oneclick (Web Settings →
// Reglas Correo → "Migrar clientes WooCommerce", ver
// @/lib/mailing/migracionWoo) — mismo propósito que
// ResultadoEnvioMasivoWhatsapp, pero sin cupón (esta campaña no genera
// ninguno).
export interface ResultadoEnvioMasivoCorreo {
  total: number;
  enviados: number;
  fallidos: number;
  sinEmail: number;
  // Clientes que ya habían recibido esta plantilla en este mismo ciclo de
  // vencimiento y que la idempotencia de disparos_regla_correo dejó afuera
  // (ver enviarCorreosMasivos). Se cuenta y se muestra en vez de sumarse en
  // silencio a "enviados": un reenvío que en realidad no mandó nada tiene que
  // notarse. `undefined` en la campaña de migración Woo, que no lo reporta.
  omitidos?: number;
}
