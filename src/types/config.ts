// Bloqueo horario del módulo Operador (registro de ingresos): fuera de estos
// rangos, solo perfiles exentos (ver esExentoHorarioOperador en helpers.ts —
// hoy equivale a "tiene acceso a Configuración", es decir Administración y
// Gerencia) pueden registrar el ingreso de un vehículo. festivos es una lista
// de fechas YYYY-MM-DD que se tratan con el horario de fin de semana.
// Un tramo de la escala de renovación preferencial por visitas (ver
// tramosRenovacionLocal en ConfigGlobal): visitasMax null = sin tope superior
// (último tramo abierto, ej. "5 o más visitas").
export interface TramoRenovacionLocal {
  id: string;
  visitasMin: number;
  visitasMax: number | null;
  precio: number;
}

/**
 * Un tramo de la escala de reactivación preferencial para clientes (Local o
 * Web) con el plan vencido hace poco (ver tramosReactivacionVencido en
 * ConfigGlobal): dos rangos independientes, días vencido y visitas del
 * último período vigente (no el histórico acumulado) — ambos con máximo
 * null = sin tope superior.
 */
export interface TramoReactivacionVencido {
  id: string;
  diasVencidoMin: number;
  diasVencidoMax: number | null;
  visitasMin: number;
  visitasMax: number | null;
  precio: number;
}

import type { TextosBotWhatsapp } from "./whatsapp";

export interface ConfigGlobal {
  horarioOperadorSemanaInicio: string;
  horarioOperadorSemanaFin: string;
  horarioOperadorFindeInicio: string;
  horarioOperadorFindeFin: string;
  festivos: string[];
  // Días de vigencia de los tickets de un Pack Empresa (ver PACKS_EMPRESA en
  // helpers.ts), editable en Web Settings — a propósito no amarrado a los 90
  // días fijos de otros productos.
  vigenciaDiasPackEmpresa: number;
  // Escala de precio de renovación preferencial para clientes Local (origen
  // distinto de "WEB") según su cantidad de visitas acumuladas
  // (Cliente.visitas), keyed por plan (mismo patrón que Precios) — permite
  // ofrecer, por ejemplo, un precio más bajo a quien pasó 0 o 1 vez que a un
  // cliente frecuente. Si un cliente no cae en ningún tramo, se usa el precio
  // preferencial general (Precios[plan].promo, ver precioRenovacionLocal).
  tramosRenovacionLocal: Record<string, TramoRenovacionLocal[]>;
  // Horas desde el pago de un "Lavado único" dentro de las cuales el módulo
  // Operador puede ofrecer la promoción de upgrade a plan (ver
  // ventaUpgradeElegible en helpers/precios.ts). Editable en Configuración;
  // acepta múltiplos de 24 para expresar días (ej: 48 = 2 días).
  horasVentanaUpgradePlan: number;
  // Escala de precio de reactivación preferencial para clientes (Local o
  // Web) con el plan vencido hace poco, keyed por plan — a diferencia de
  // tramosRenovacionLocal, si el cliente no calza en ningún tramo no se
  // ofrece la promoción (ver precioReactivacionVencido); un cliente Web sin
  // tramo sigue viendo su oferta de renovar al último valor pagado.
  tramosReactivacionVencido: Record<string, TramoReactivacionVencido[]>;
  // Horas mínimas entre dos ingresos por plan de un mismo vehículo antes de
  // volver a quedar "libre" para reingresar (ver estadoReingresoPlan en
  // helpers/ingresos.ts). Acepta decimales (ej: 24.5 = 24 horas 30 min).
  horasBloqueoReingresoPlan: number;
  // Monto (CLP) y días de vigencia del cupón de descuento que arma la
  // Opción 5 del bot de WhatsApp para clientes nuevos (ver
  // manejarPasoRegistroDescuento en @/lib/whatsapp/router).
  descuentoPrimeraVezValor: number;
  descuentoPrimeraVezDiasValidez: number;
  // Contenido editable de las respuestas automáticas del bot de WhatsApp —
  // ver TextosBotWhatsapp.
  textosBotWhatsapp: TextosBotWhatsapp;
  // URL pública (Supabase Storage) de la imagen adjunta en la Opción 1
  // (precios) / Opción 2 (plan) del bot de WhatsApp. undefined/vacío usa el
  // archivo estático de fábrica (ver SERVICIOS_IMAGEN_PATH/PLAN_IMAGEN_PATH
  // en @/lib/whatsapp/contenido).
  imagenPreciosWhatsapp?: string;
  imagenPlanWhatsapp?: string;
  // Firma HTML del gestor de correo (ver @/types/buzon) — vacía por defecto.
  firmaCorreo: string;
}
