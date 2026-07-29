import { normPlate, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

export const ESTADO_PRIORIDAD: Record<string, number> = { Vencido: 0, "Por vencer": 1, "Sin plan": 2, Vigente: 3 };

function coincidePatente(c: Cliente, qPatente: string): boolean {
  return qPatente.length > 0 && normPlate(c.patente).includes(qPatente);
}

function coincideNombre(c: Cliente, q: string): boolean {
  return q.length > 0 && c.nombre.toLowerCase().includes(q);
}

// Rango de relevancia: todo lo que coincide por patente se ordena antes que
// lo que solo coincide por nombre, ya que patente es el campo de búsqueda
// más específico (identifica un único vehículo/cliente).
function relevancia(c: Cliente, query: string): number {
  const nombre = c.nombre.toLowerCase();
  const q = query.toLowerCase().trim();
  const patente = normPlate(c.patente);
  const qPatente = normPlate(query);

  if (qPatente && patente === qPatente) return 0;
  if (qPatente && patente.startsWith(qPatente)) return 1;
  if (qPatente && patente.includes(qPatente)) return 2;
  if (q && nombre.startsWith(q)) return 3;
  if (q && nombre.split(" ").some((palabra) => palabra.startsWith(q))) return 4;
  if (q && nombre.includes(q)) return 5;
  return 6;
}

function ordenColumna(a: Cliente, b: Cliente, orden: string): number {
  switch (orden) {
    case "vencimiento_asc": {
      const va = a.vencimiento ? new Date(a.vencimiento).getTime() : Infinity;
      const vb = b.vencimiento ? new Date(b.vencimiento).getTime() : Infinity;
      return va - vb;
    }
    case "vencimiento_desc": {
      const va = a.vencimiento ? new Date(a.vencimiento).getTime() : -Infinity;
      const vb = b.vencimiento ? new Date(b.vencimiento).getTime() : -Infinity;
      return vb - va;
    }
    case "visitas_desc":
      return (b.visitas || 0) - (a.visitas || 0);
    case "visitas_asc":
      return (a.visitas || 0) - (b.visitas || 0);
    case "estado":
    default: {
      const pa = ESTADO_PRIORIDAD[planStatus(a).label] ?? 9;
      const pb = ESTADO_PRIORIDAD[planStatus(b).label] ?? 9;
      return pa - pb;
    }
  }
}

export function filtrarYOrdenarClientes(
  clientes: Cliente[],
  opts: { search: string; filtroEstado: string; orden: string }
): Cliente[] {
  const { search, filtroEstado, orden } = opts;
  const qPatente = normPlate(search);
  const qNombre = search.toLowerCase().trim();
  let filtered = clientes.filter((c) => !search || coincidePatente(c, qPatente) || coincideNombre(c, qNombre));
  if (filtroEstado !== "todos") {
    filtered = filtered.filter((c) => planStatus(c).label === filtroEstado);
  }
  return [...filtered].sort((a, b) => {
    if (search) {
      const ra = relevancia(a, search);
      const rb = relevancia(b, search);
      if (ra !== rb) return ra - rb;
    }
    return ordenColumna(a, b, orden);
  });
}
