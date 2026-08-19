import type { Estanque, EstanqueConLectura, LecturaEstanque, PlanStatusCls, Valvula } from "@/types";

// Un dispositivo que reporta cada ~60s y lleva 5 minutos mudo está caído (o
// se quedó sin WiFi). Pasado eso la lectura deja de mostrarse como nivel
// actual: un número viejo en pantalla es peor que un "sin señal", porque
// nadie sale a mirar el estanque. Mismo criterio que fotoFilaFresca.
export const MAX_EDAD_LECTURA_MS = 5 * 60 * 1000;

/** Fracción de la capacidad bajo la cual un estanque sin umbral propio se
 *  considera crítico. */
const UMBRAL_BAJO_DEFAULT = 0.2;

/** Cuánto por sobre el umbral crítico se muestra como "Bajo" (naranja). */
const MARGEN_AVISO = 1.5;

export function umbralBajo(e: Pick<Estanque, "capacidadLitros" | "umbralBajoLitros">): number {
  return e.umbralBajoLitros ?? e.capacidadLitros * UMBRAL_BAJO_DEFAULT;
}

/** Convierte lo que mandó el sensor a litros con la calibración del estanque.
 *  Ver el comentario de @/db/schema/estanques: `litrosPorUnidad` negativo es
 *  un sensor que mide distancia al agua (ultrasónico) en vez de columna. */
export function litrosDesdeCrudo(e: Pick<Estanque, "offsetCrudo" | "litrosPorUnidad">, crudo: number): number {
  return Math.max(0, (crudo - e.offsetCrudo) * e.litrosPorUnidad);
}

export function lecturaFresca(lectura: LecturaEstanque | null, ahora: number): boolean {
  if (!lectura) return false;
  const t = new Date(lectura.medidoEn).getTime();
  return Number.isFinite(t) && ahora - t <= MAX_EDAD_LECTURA_MS;
}

export interface NivelEstanque {
  litros: number | null;
  /** Recortado a 0-100 para la barra; `litros` conserva el valor real. */
  porcentaje: number | null;
  cls: PlanStatusCls;
  label: string;
}

export function nivelEstanque(e: EstanqueConLectura, ahora: number): NivelEstanque {
  if (!lecturaFresca(e.ultima, ahora)) {
    return { litros: null, porcentaje: null, cls: "bad", label: "Sin señal" };
  }
  const litros = litrosDesdeCrudo(e, e.ultima!.crudo);
  const porcentaje = e.capacidadLitros > 0 ? Math.min(100, (litros / e.capacidadLitros) * 100) : null;
  if (litros >= e.capacidadLitros) return { litros, porcentaje, cls: "warn", label: "Lleno" };
  if (litros <= umbralBajo(e)) return { litros, porcentaje, cls: "bad", label: "Crítico" };
  if (litros <= umbralBajo(e) * MARGEN_AVISO) return { litros, porcentaje, cls: "warn", label: "Bajo" };
  return { litros, porcentaje, cls: "ok", label: "Normal" };
}

/** Corte por estanque lleno, evaluado en /api/estanques/telemetria contra la
 *  lectura que acaba de llegar.
 *
 *  Es un respaldo, NO la protección contra rebalse: si se corta el WiFi o
 *  muere el sensor esto nunca se evalúa. El estanque igual tiene que llevar
 *  su boya mecánica cortando el llenado por hardware. Por eso mismo devuelve
 *  false sin lectura utilizable: sin señal no se toca nada, que trabaje la
 *  boya.
 *
 *  Cuando da true, la ruta CIERRA la válvula de verdad (escribe abierta=false)
 *  en vez de enmascarar la respuesta. Enmascarar dejaba el corte dependiendo
 *  de cada lectura, y con el ruido normal de un sensor (±0,3) un estanque
 *  parado justo en el tope hacía que la orden alternara abierta/cerrada en
 *  cada ciclo: una bola motorizada abriendo y cerrando sola hasta romperse.
 *  Cerrando de verdad, el corte queda enganchado y reabrir es una decisión
 *  explícita del operador. */
export function debeCerrarPorLleno(e: Estanque, crudo: number | null): boolean {
  if (crudo === null) return false;
  return litrosDesdeCrudo(e, crudo) >= e.capacidadLitros;
}

/** Cuánto dura una orden de apertura antes de caducar sola. */
export const MAX_APERTURA_MS = 60 * 60 * 1000;

/** Una apertura pedida hace mucho se considera caducada y la ruta cierra la
 *  válvula.
 *
 *  Cubre la otra mitad del riesgo que el firmware cubre de su lado: el
 *  controlador cierra si se queda sin servidor, pero el servidor guardaba
 *  `abierta=true` para siempre — al reconectar horas después, la primera
 *  respuesta volvía a abrir el agua sin nadie en el local. Una hora alcanza
 *  de sobra para llenar cualquier estanque; si no alcanzó, el operador
 *  reabre.
 *
 *  ponytail: tope fijo para todos. Si algún estanque necesita llenados más
 *  largos, esto pasa a ser una columna de `estanques`. */
export function aperturaCaducada(v: Pick<Valvula, "abierta" | "cambiadoEn">, ahora: number): boolean {
  if (!v.abierta) return false;
  const t = new Date(v.cambiadoEn).getTime();
  // Fecha ilegible: se trata como caducada. Ante la duda, el agua se corta.
  return !Number.isFinite(t) || ahora - t > MAX_APERTURA_MS;
}
