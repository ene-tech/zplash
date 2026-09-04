import { estadoRenovacion, normPlate, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

export const ESTADO_PRIORIDAD: Record<string, number> = { Vencido: 0, "Por vencer": 1, "Sin plan": 2, Vigente: 3 };

// Extremo del rango "pasadas desde/hasta" del toolbar de Clientes. Llega el
// string crudo del input: vacío o a medio tipear (ej. "-", "1e") se trata como
// extremo abierto, así la tabla no queda vacía mientras el usuario escribe.
function limitePasadas(valor: string | undefined, abierto: number): number {
  if (!valor || !valor.trim()) return abierto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : abierto;
}

function coincidePatente(c: Cliente, qPatente: string): boolean {
  return qPatente.length > 0 && normPlate(c.patente).includes(qPatente);
}

function coincideNombre(c: Cliente, q: string): boolean {
  return q.length > 0 && c.nombre.toLowerCase().includes(q);
}

// Rango de relevancia: todo lo que coincide por patente se ordena antes que
// lo que solo coincide por nombre, ya que patente es el campo de búsqueda
// más específico (identifica un único vehículo/cliente). `q`/`qPatente` se
// reciben ya normalizados: normalizar la query acá adentro significaba
// rehacerlo una vez por cliente.
function relevancia(c: Cliente, q: string, qPatente: string): number {
  const nombre = c.nombre.toLowerCase();
  const patente = normPlate(c.patente);

  if (qPatente && patente === qPatente) return 0;
  if (qPatente && patente.startsWith(qPatente)) return 1;
  if (qPatente && patente.includes(qPatente)) return 2;
  if (q && nombre.startsWith(q)) return 3;
  if (q && nombre.split(" ").some((palabra) => palabra.startsWith(q))) return 4;
  if (q && nombre.includes(q)) return 5;
  return 6;
}

// Clave numérica de orden, siempre ascendente (los órdenes "desc" invierten
// el signo acá en vez de invertir el comparador). Cada orden tiene su propio
// valor para el cliente sin dato, elegido para que esas filas queden al final
// en ambas direcciones.
function claveColumna(c: Cliente, orden: string): number {
  switch (orden) {
    case "vencimiento_asc":
      return c.vencimiento ? new Date(c.vencimiento).getTime() : Infinity;
    case "vencimiento_desc":
      return c.vencimiento ? -new Date(c.vencimiento).getTime() : Infinity;
    case "visitas_desc":
      return -(c.visitas || 0);
    case "visitas_asc":
      return c.visitas || 0;
    case "estado":
    default:
      return ESTADO_PRIORIDAD[planStatus(c).label] ?? 9;
  }
}

export function filtrarYOrdenarClientes(
  clientes: Cliente[],
  opts: {
    search: string;
    filtroEstado: string;
    filtroOrigen?: string;
    filtroSuscripcion?: string;
    filtroPlan?: string;
    /** patente normalizada → estado Oneclick; null mientras carga (ver ClientesTab). */
    suscripciones?: Map<string, string> | null;
    pasadasDesde?: string;
    pasadasHasta?: string;
    orden: string;
  }
): Cliente[] {
  const { search, filtroEstado, filtroOrigen = "todos", filtroSuscripcion = "todas", filtroPlan = "todos", suscripciones, pasadasDesde, pasadasHasta, orden } = opts;
  const qPatente = normPlate(search);
  const qNombre = search.toLowerCase().trim();
  let filtered = clientes.filter((c) => !search || coincidePatente(c, qPatente) || coincideNombre(c, qNombre));
  if (filtroEstado !== "todos") {
    filtered = filtered.filter((c) => planStatus(c).label === filtroEstado);
  }
  if (filtroOrigen !== "todos") {
    // c.origen guarda "WEB"/"LOCAL" (ver Cliente en @/types/clientes); default
    // "LOCAL" para filas viejas sin el campo seteado, mismo fallback que usa
    // ClienteRow para mostrarlo.
    filtered = filtered.filter((c) => (c.origen || "LOCAL") === filtroOrigen);
  }
  if (filtroPlan !== "todos") {
    filtered = filtered.filter((c) => (c.plan || "-") === filtroPlan);
  }
  // `suscripciones` null = el fetch de Oneclick aún no resolvió: sin el mapa
  // todo cliente sin marca Woo clasificaría como "sin RA" y la tabla quedaría
  // vacía un instante para después cambiar sola; mejor no filtrar hasta tener
  // el dato.
  if (filtroSuscripcion !== "todas" && suscripciones) {
    // Se filtra por la misma etiqueta que muestra la columna "Suscripción"
    // (estadoRenovacion, ver ClienteRow). "Sin RA" agrupa "Web sin RA" y
    // "Local sin RA": para separar por origen ya está el filtro de origen.
    filtered = filtered.filter((c) => {
      const label = estadoRenovacion(c, suscripciones?.get(normPlate(c.patente))).label;
      return filtroSuscripcion === "Sin RA" ? label.endsWith("sin RA") : label === filtroSuscripcion;
    });
  }
  const desde = limitePasadas(pasadasDesde, -Infinity);
  const hasta = limitePasadas(pasadasHasta, Infinity);
  if (desde !== -Infinity || hasta !== Infinity) {
    filtered = filtered.filter((c) => (c.visitas || 0) >= desde && (c.visitas || 0) <= hasta);
  }
  // Decorate-sort-undecorate: la clave de cada cliente se calcula UNA vez, no
  // una vez por comparación. Antes el comparador llamaba a relevancia() y a
  // planStatus() en cada par — con ~2000 clientes son ~44.000 llamadas por
  // tecla tipeada, y planStatus() termina en un Intl.DateTimeFormat (ver
  // fechaEnSantiago en @/lib/helpers/fechas). Era el costo dominante de
  // escribir en el buscador de Clientes.
  const decorados = filtered.map((c) => ({
    c,
    rel: search ? relevancia(c, qNombre, qPatente) : 0,
    col: claveColumna(c, orden),
  }));
  // Comparación por < / > en vez de restar: con vencimientos vacíos las claves
  // son ±Infinity y la resta daba NaN, que deja el orden de esas filas
  // indefinido según la especificación de Array.prototype.sort.
  decorados.sort((a, b) => {
    if (a.rel !== b.rel) return a.rel - b.rel;
    return a.col < b.col ? -1 : a.col > b.col ? 1 : 0;
  });
  return decorados.map((d) => d.c);
}
