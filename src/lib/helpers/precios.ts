import type { ConfigGlobal, Precios, PreciosTamano, TamanoVehiculo, Venta } from "@/types";

export const PLANES = ["Plan Ilimitado Mensual"];

export const PRECIOS_DEFAULT: Precios = {
  "Plan Ilimitado Mensual": { normal: 21990, promo: 19990 },
  tapiz: { normal: 39990, promo: 0 },
  alfombra: { normal: 19990, promo: 0 },
  techo: { normal: 19990, promo: 0 },
  motor: { normal: 29990, promo: 0 },
  "chasis-grafitado": { normal: 59990, promo: 0 },
};

/** Precios por tamaño para el Lavado Completo Detailing (id "detailing-mediano",
 * único servicio de esa categoría desde que se fusionaron los 3 SKUs de
 * tamaño — Auto Pequeño/Mediano-SUV-Pickup/Auto XL — en uno solo con precio
 * S/M/L/XL, ver migración 0055). Solo usado como fallback si `precios_tamano`
 * viniera vacío (instalación nueva/sin datos aún). */
export const PRECIOS_TAMANO_DEFAULT: PreciosTamano = {
  "detailing-mediano": { s: 24990, m: 29990, l: 34990, xl: 39990 },
};

/** Precio de un lavado único para clientes sin plan vigente (vencido o sin plan). */
export const PRECIO_LAVADO_UNICO = 9990;

/** Clave usada dentro de Precios para guardar el valor editable del lavado
 * único PRESENCIAL (módulo Operador, ficha de cliente, ingreso sin registro)
 * — ver LAVADO_UNICO_WEB_KEY para el mismo servicio comprado por /pagar,
 * que es un canal de venta aparte con su propio precio editable. */
export const LAVADO_UNICO_KEY = "Lavado único";

/** Clave usada dentro de Precios para guardar el valor editable del lavado
 * único comprado desde /pagar — separado de LAVADO_UNICO_KEY a propósito
 * (ver PagosWebSection) para poder tener una promoción web distinta a la
 * presencial sin que una afecte a la otra. */
export const LAVADO_UNICO_WEB_KEY = "Lavado único (Web)";

/** `Venta.tipo` con el que queda un "Lavado único" comprado por adelantado
 * desde /pagar (ver retorno/route.ts, que arma el tipo como `${nombre} (Web)`
 * y nombre siempre es "Lavado único" para este ítem del carrito) — mismo
 * string que LAVADO_UNICO_WEB_KEY por coincidencia de nomenclatura, pero es
 * un concepto distinto: esto identifica una Venta ya hecha, no una clave de
 * Precios. */
export const LAVADO_UNICO_WEB_TIPO = `${LAVADO_UNICO_KEY} (Web)`;

/**
 * Venta de "Lavado único (Web)" ya pagada por este cliente pero todavía sin
 * canjear físicamente (ver registrarIngresoLavadoWeb en lib/logic/ingresos) —
 * la más antigua sin canjear, por si compró más de una y no vino a
 * buscarlas todas de una vez.
 */
export function ventaLavadoWebPendiente(ventas: Venta[], clienteId: string): Venta | undefined {
  return ventas
    .filter((v) => v.clienteId === clienteId && v.tipo === LAVADO_UNICO_WEB_TIPO && !v.canjeadaEn)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0];
}

/**
 * Precio del plan para quien contrata con renovación automática (Oneclick
 * Mall) desde /pagar — más barato que pagar un período a la vez con Webpay
 * Plus, para incentivar la renovación automática. Es un canal de venta
 * digital aparte y NO tiene relación con `precioPreferencial`/`promo`, que es
 * el descuento de renovación para un cliente físico atendido en el local.
 */
export const PRECIO_PLAN_ONECLICK_DEFAULT = 19990;

/** Clave usada dentro de Precios para guardar el valor editable del plan con renovación automática. */
export const PLAN_ONECLICK_KEY = "Plan Ilimitado Mensual (Renovación Automática)";

export function precioPlanOneclick(precios: Precios): number {
  return (precios[PLAN_ONECLICK_KEY] && precios[PLAN_ONECLICK_KEY].normal) || PRECIO_PLAN_ONECLICK_DEFAULT;
}

/** Precio del uso puntual de la zona de aspirado autoservicio, sin plan ni límite de tiempo. */
export const PRECIO_ZONA_ASPIRADO = 4990;

/** Clave usada dentro de Precios para guardar el valor editable de la zona de aspirado autoservicio. */
export const ZONA_ASPIRADO_KEY = "Uso Zona Aspirado Autoservicio";

/** Precio vigente del uso de la zona de aspirado autoservicio, editable por el administrador; si no se ha guardado uno, usa el valor por defecto. */
export function precioZonaAspirado(precios: Precios): number {
  return (precios[ZONA_ASPIRADO_KEY] && precios[ZONA_ASPIRADO_KEY].normal) || PRECIO_ZONA_ASPIRADO;
}

/** Monto adicional (sobre el lavado único ya pagado) para convertir la visita de hoy en la contratación del Plan Ilimitado Mensual — promoción ofrecida en el módulo Operador dentro de la ventana configurada (ver ConfigGlobal.horasVentanaUpgradePlan). */
export const PRECIO_UPGRADE_PLAN_DEFAULT = 12000;

/** Clave usada dentro de Precios para guardar el valor editable del upgrade a plan. */
export const UPGRADE_PLAN_KEY = "Upgrade a Plan Ilimitado";

export function precioUpgradePlan(precios: Precios): number {
  return (precios[UPGRADE_PLAN_KEY] && precios[UPGRADE_PLAN_KEY].normal) || PRECIO_UPGRADE_PLAN_DEFAULT;
}

/**
 * Venta de "Lavado único" del cliente elegible para convertirse en
 * contratación del Plan Ilimitado Mensual vía la promoción de upgrade: la más
 * reciente, y solo si ocurrió hace menos de `horasVentana` (ver
 * ConfigGlobal.horasVentanaUpgradePlan) — pasada esa ventana el lavado ya se
 * disfrutó sin plan y la promoción deja de tener sentido.
 */
export function ventaUpgradeElegible(
  ventas: Venta[],
  clienteId: string,
  horasVentana: number,
  ahora: Date = new Date()
): Venta | undefined {
  const ultima = ventas
    .filter((v) => v.clienteId === clienteId && v.tipo === "Lavado único")
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  if (!ultima) return undefined;
  const msDesde = ahora.getTime() - new Date(ultima.fecha).getTime();
  if (msDesde > horasVentana * 3600 * 1000) return undefined;
  return ultima;
}

/**
 * Venta de "Lavado único" pareja de un Ingreso (ver cobrarLavadoUnico en
 * useIngresoActions): ambas filas se crean juntas en el mismo commit, pero
 * sin una FK que las ligue explícitamente — se matchean por mismo cliente y
 * fecha casi idéntica (dentro de `toleranciaMs`, la más cercana si hay más
 * de una candidata). Usada al borrar un Ingreso (ver eliminarIngreso en
 * @/lib/logic) para que borrar el paso por el túnel también borre la venta
 * que lo acompañó: si no, el cliente sigue apareciendo elegible para la
 * promoción de upgrade a plan (ver ventaUpgradeElegible) por un lavado que,
 * en teoría, nunca ocurrió.
 */
export function ventaLavadoUnicoDeIngreso(
  ventas: Venta[],
  ingreso: { clienteId: string; fecha: string },
  toleranciaMs = 60_000
): Venta | undefined {
  const fechaIngreso = new Date(ingreso.fecha).getTime();
  let mejor: Venta | undefined;
  let mejorDelta = Infinity;
  for (const v of ventas) {
    if (v.clienteId !== ingreso.clienteId || v.tipo !== "Lavado único") continue;
    const delta = Math.abs(new Date(v.fecha).getTime() - fechaIngreso);
    if (delta <= toleranciaMs && delta < mejorDelta) {
      mejor = v;
      mejorDelta = delta;
    }
  }
  return mejor;
}

/** Texto legible de la ventana de la promoción de upgrade a plan (ver ventaUpgradeElegible), en horas o días si es múltiplo exacto de 24. */
export function fmtHorasVentanaUpgradePlan(horas: number): string {
  if (horas % 24 === 0) {
    const dias = horas / 24;
    return dias === 1 ? "1 día" : `${dias} días`;
  }
  return horas === 1 ? "1 hora" : `${horas} horas`;
}

/** Catálogo fijo de los 4 packs de tickets para empresas (flotas, automotoras,
 * rent a car, talleres mecánicos), vendidos online con Webpay desde la
 * pestaña "Venta a Empresa" del portal cliente. `key` es la clave usada
 * dentro de `Precios` (mismo patrón que PLAN_ONECLICK_KEY/UPGRADE_PLAN_KEY),
 * y `precioDefault` es el valor IVA incluido publicado en zplash.cl/empresas/
 * mientras el administrador no lo edite desde Web Settings. */
export const PACKS_EMPRESA = [
  { cantidad: 10, key: "Pack Empresa 10 Tickets", precioDefault: 89990 },
  { cantidad: 20, key: "Pack Empresa 20 Tickets", precioDefault: 159990 },
  { cantidad: 30, key: "Pack Empresa 30 Tickets", precioDefault: 224990 },
  { cantidad: 40, key: "Pack Empresa 40 Tickets", precioDefault: 279600 },
] as const;

export type CantidadPackEmpresa = (typeof PACKS_EMPRESA)[number]["cantidad"];

export function packEmpresaPorCantidad(cantidad: number): (typeof PACKS_EMPRESA)[number] | undefined {
  return PACKS_EMPRESA.find((p) => p.cantidad === cantidad);
}

/** Precio vigente de un pack empresa, editable por el administrador desde Web Settings; si no se ha guardado uno, usa precioDefault. */
export function precioPackEmpresa(precios: Precios, cantidad: number): number {
  const pack = packEmpresaPorCantidad(cantidad);
  if (!pack) return 0;
  return (precios[pack.key] && precios[pack.key].normal) || pack.precioDefault;
}

export function fmtCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function precioNormal(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].normal) || 0;
}

export function precioPreferencial(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].promo) || 0;
}

/**
 * Precio de renovación preferencial para un cliente Local según su cantidad
 * de visitas acumuladas (ver tramosRenovacionLocal en ConfigGlobal): busca el
 * tramo cuyo rango [visitasMin, visitasMax] contiene `visitas` (evaluando los
 * tramos ordenados de menor a mayor visitasMin, para que el resultado sea
 * determinístico aunque el admin los haya guardado en otro orden). Si ninguno
 * calza, cae al precio preferencial general (Precios[plan].promo).
 */
export function precioRenovacionLocal(config: ConfigGlobal, precios: Precios, plan: string, visitas: number): number {
  const tramos = [...(config.tramosRenovacionLocal[plan] || [])].sort((a, b) => a.visitasMin - b.visitasMin);
  const match = tramos.find((t) => visitas >= t.visitasMin && (t.visitasMax === null || visitas <= t.visitasMax));
  return match ? match.precio : precioPreferencial(precios, plan);
}

/**
 * Precio de reactivación preferencial para un cliente (Local o Web) con el
 * plan vencido hace poco (ver tramosReactivacionVencido en ConfigGlobal): busca el
 * tramo cuyos rangos [diasVencidoMin, diasVencidoMax] y [visitasMin,
 * visitasMax] contienen `diasVencido`/`visitas` respectivamente (tramos
 * ordenados por diasVencidoMin y luego visitasMin para un resultado
 * determinístico). A diferencia de precioRenovacionLocal, si ningún tramo
 * calza no hay precio de respaldo: `undefined` significa que no corresponde
 * ofrecer la promoción.
 */
export function precioReactivacionVencido(
  config: ConfigGlobal,
  plan: string,
  diasVencido: number,
  visitas: number
): number | undefined {
  const tramos = [...(config.tramosReactivacionVencido[plan] || [])].sort(
    (a, b) => a.diasVencidoMin - b.diasVencidoMin || a.visitasMin - b.visitasMin
  );
  const match = tramos.find(
    (t) =>
      diasVencido >= t.diasVencidoMin &&
      (t.diasVencidoMax === null || diasVencido <= t.diasVencidoMax) &&
      visitas >= t.visitasMin &&
      (t.visitasMax === null || visitas <= t.visitasMax)
  );
  return match?.precio;
}

/** Precio vigente del lavado único PRESENCIAL, editable por el administrador; si no se ha guardado uno, usa el valor por defecto. */
export function precioLavadoUnico(precios: Precios): number {
  return (precios[LAVADO_UNICO_KEY] && precios[LAVADO_UNICO_KEY].normal) || PRECIO_LAVADO_UNICO;
}

/** Precio vigente del lavado único comprado desde /pagar (canal Web), editable
 * aparte del presencial; si no se ha guardado uno, usa el mismo valor por
 * defecto que el presencial. */
export function precioLavadoUnicoWeb(precios: Precios): number {
  return (precios[LAVADO_UNICO_WEB_KEY] && precios[LAVADO_UNICO_WEB_KEY].normal) || PRECIO_LAVADO_UNICO;
}

/** Precio vigente de un servicio del catálogo, editable por el administrador desde Configuración; si no se ha guardado uno, es 0. */
export function precioServicio(precios: Precios, servicioId: string): number {
  return (precios[servicioId] && precios[servicioId].normal) || 0;
}

/**
 * Precio de un servicio para un tamaño de vehículo dado (ver PreciosTamano):
 * si el servicio no tiene fila en `preciosTamano`, o el tamaño puntual quedó
 * en 0 sin cargar, cae al precio flat de `precios` (precioServicio) — así un
 * servicio recién agregado no muestra $0 mientras el admin no haya cargado
 * los 4 precios por tamaño.
 */
export function precioServicioTamano(
  precios: Precios,
  preciosTamano: PreciosTamano,
  servicioId: string,
  tamano: TamanoVehiculo
): number {
  return preciosTamano[servicioId]?.[tamano] || precioServicio(precios, servicioId);
}
