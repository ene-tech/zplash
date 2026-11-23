// Catálogo de "qué se vendió" del Cierre de Caja: una fila por tipo de venta
// conocido. Vive aparte de useCierreData porque ArqueoDia lo reusa para
// etiquetar el tipo de cada venta en la tabla del día.
/** Venta cobrada en caja que no pasaba por el túnel ni por el catálogo de
 * planes/servicios (lavado de moto, de bicicleta, etc.). Ya no se crea desde
 * ninguna pantalla —el arqueo dejó de cargar ventas a mano y eso ahora se
 * cuadra con el asiento de ajuste de ingreso monetario, ver ArqueoDia—, pero
 * el tipo se queda acá para que las ventas históricas sigan sumando en su
 * fila de "Detalle de venta" y no caigan en "Otros". */
import { LAVADO_EXTRA_PLAN_TIPO, PROMO_2_LAVADOS_KEY, PROMO_5_LAVADOS_KEY, PROMO_RECOMPRA_2_KEY, PROMO_VIP_KEY, SOLO_TUNEL_KEY, TIPO_VENTA_PRODUCTOS, UPGRADE_DESCUENTO_KEY, UPGRADE_PACK_KEY, ZONA_ASPIRADO_KEY } from "@/lib/helpers";

export const TIPO_VENTA_PUNTUAL = "Venta puntual";

/** Subtítulos de "Detalle de venta" del Cierre de Caja, en el orden en que se
 * muestran. Cada fila (de PRODUCTOS_CIERRE o de calcularFilasVentaCierre)
 * dice a qué grupo pertenece. */
export const GRUPOS_CIERRE = [
  "Tickets Locales",
  "Servicios adicionales Locales",
  "Venta Nueva Web",
  "Planes online Web Antigua",
  "Planes Locales (histórico)",
  "Venta Empresa",
  "Tienda",
  "Ajustes",
] as const;
export type GrupoCierre = (typeof GRUPOS_CIERRE)[number];

export const PRODUCTOS_CIERRE: { tipo: string; label: string; grupo: GrupoCierre }[] = [
  { tipo: "Lavado único", label: "Lavado Tunel / Uso Aspirado", grupo: "Tickets Locales" },
  { tipo: LAVADO_EXTRA_PLAN_TIPO, label: "Lavado extra plan (cliente con plan vigente)", grupo: "Tickets Locales" },
  { tipo: SOLO_TUNEL_KEY, label: "Solo túnel (sin aspirado)", grupo: "Tickets Locales" },
  { tipo: ZONA_ASPIRADO_KEY, label: "Solo aspirado autoservicio (sin lavado)", grupo: "Tickets Locales" },
  { tipo: PROMO_2_LAVADOS_KEY, label: "Promo 2 lavados (2 tickets para un auto)", grupo: "Tickets Locales" },
  { tipo: PROMO_5_LAVADOS_KEY, label: "Promo 4 lavados (4 tickets para un auto)", grupo: "Tickets Locales" },
  { tipo: UPGRADE_PACK_KEY, label: "Upgrade a Promo 4 lavados (3 tickets sobre un Lavado Tunel / Uso Aspirado)", grupo: "Tickets Locales" },
  { tipo: UPGRADE_DESCUENTO_KEY, label: "Upgrade lavado con descuento (2 tickets)", grupo: "Tickets Locales" },
  { tipo: PROMO_VIP_KEY, label: "Promo 5 Tickets VIP (4 para un auto + 1 libre)", grupo: "Tickets Locales" },
  { tipo: PROMO_RECOMPRA_2_KEY, label: "Promo 2 Tickets 15 días (recompra al terminar un pack)", grupo: "Tickets Locales" },
  { tipo: TIPO_VENTA_PUNTUAL, label: "Venta puntual (moto, bicicleta, otros)", grupo: "Tickets Locales" },
  { tipo: "Plan nuevo", label: "Contratación de plan", grupo: "Planes Locales (histórico)" },
  { tipo: "Renovación preferencial", label: "Renovación temprana", grupo: "Planes Locales (histórico)" },
  { tipo: "Reactivación promocional", label: "Reactivación promocional (plan vencido)", grupo: "Planes Locales (histórico)" },
  { tipo: "Renovación atrasada", label: "Renovación atrasada (dentro del plazo de gracia)", grupo: "Planes Locales (histórico)" },
  { tipo: "Plan nuevo (Web)", label: "Contratación de plan (Web automático)", grupo: "Planes online Web Antigua" },
  { tipo: "Renovación (Web)", label: "Renovación de plan (Web automático)", grupo: "Planes online Web Antigua" },
  { tipo: "Cupón Venta Empresa", label: "Cupón Venta Empresa", grupo: "Venta Empresa" },
  { tipo: TIPO_VENTA_PRODUCTOS, label: "Venta de productos (tienda)", grupo: "Tienda" },
];
