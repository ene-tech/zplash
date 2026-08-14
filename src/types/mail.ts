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

export type TipoEventoReglaCorreo = "venta_creada" | "plan_proximo_vencer" | "plan_vencido" | "cobro_fallido" | "migracion_woo_legacy";

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
}
