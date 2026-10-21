import { inRange } from "@/lib/helpers";
import type { Cupon } from "@/types";

// Un lote de descuentos cuenta como campaña cuando es masivo (este mínimo de
// códigos) y lo creó una persona o un script de campaña. Los que emiten solos
// la landing, el bot, las reglas y el cron de referidos no son campañas: son
// el goteo de todos los días (y los referidos ya tienen su propia sección).
const MIN_CODIGOS_CAMPANA = 20;
const esAutomatico = (c: Cupon) =>
  c.creadoPor === "landing-web" ||
  c.creadoPor === "whatsapp-bot" ||
  c.creadoPor === "referidos-cron" ||
  !!c.creadoPor?.startsWith("regla-whatsapp:");

// Un código "un uso por patente" no queda `usado`: sus canjes son las
// patentes de patentesUsadas.
const canjes = (c: Cupon) => (c.unUsoPorPatente ? (c.patentesUsadas?.length ?? 0) : c.usado ? 1 : 0);

export interface FilaCampana {
  nombre: string;
  fecha: string;
  enviados: number;
  canjeados: number;
}

// Tickets (vales = lavado gratis) emitidos y canjeados en el período, y
// campañas de descuento lanzadas en el período con sus canjes a la fecha.
export function ticketsYCampanas(cupones: Cupon[], desde: string, hasta: string, ahora = new Date()) {
  const vales = cupones.filter((c) => c.tipo === "vale");
  const tickets = {
    emitidos: vales.filter((c) => inRange(c.creadoEn, desde, hasta)).length,
    canjeados: vales.filter((c) => c.usado && inRange(c.fechaUso, desde, hasta)).length,
    vivos: vales.filter((c) => !c.usado && new Date(c.fechaCaducidad) > ahora).length,
  };

  const porLote = new Map<string, Cupon[]>();
  for (const c of cupones) {
    if (c.tipo !== "descuento" || esAutomatico(c)) continue;
    const lote = porLote.get(c.nombreLote);
    if (lote) lote.push(c);
    else porLote.set(c.nombreLote, [c]);
  }
  const campanas: FilaCampana[] = [...porLote.entries()]
    .filter(([, cs]) => cs.length >= MIN_CODIGOS_CAMPANA)
    .map(([nombre, cs]) => ({
      nombre,
      fecha: cs.reduce((min, c) => (c.creadoEn < min ? c.creadoEn : min), cs[0].creadoEn),
      enviados: cs.length,
      canjeados: cs.reduce((s, c) => s + canjes(c), 0),
    }))
    .filter((f) => inRange(f.fecha, desde, hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return { tickets, campanas };
}
