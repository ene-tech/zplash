import { ahoraEnSantiago, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

/** Días transcurridos entre `fechaISO` y hoy, anclado a medianoche en Chile
 * (mismo criterio que planStatus) — para los filtros de "conducta de compra"
 * (inactividad, antigüedad), que deben dar el mismo resultado sin importar la
 * hora del día en que se filtre. */
export function diasDesde(fechaISO: string): number {
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaISO);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - fecha.getTime()) / 86400000);
}

export interface FiltrosMensajeMasivo {
  filtroEstado: string;
  filtroOrigen: string;
  visitasMin: string;
  visitasMax: string;
  inactivoDiasMin: string;
  clienteDesdeDiasMin: string;
  busqueda: string;
}

export function filtrarClientesMensajeMasivo(clientes: Cliente[], f: FiltrosMensajeMasivo): Cliente[] {
  const q = f.busqueda.trim().toLowerCase();
  return clientes.filter((c) => {
    if (f.filtroEstado !== "todos" && planStatus(c).label !== f.filtroEstado) return false;
    if (f.filtroOrigen !== "todos" && (c.origen || "LOCAL") !== f.filtroOrigen) return false;
    if (f.visitasMin && (c.visitas || 0) < Number(f.visitasMin)) return false;
    if (f.visitasMax && (c.visitas || 0) > Number(f.visitasMax)) return false;
    // Sin ultimaVisita (nunca ha venido) cuenta como "siempre inactivo" —
    // cualquier mínimo de días exigido lo deja adentro.
    if (f.inactivoDiasMin && c.ultimaVisita && diasDesde(c.ultimaVisita) < Number(f.inactivoDiasMin)) return false;
    // Antigüedad del CLIENTE, o sea `creadoEn`, no `fechaContratacion`. Esta
    // última es el ancla del ciclo de plan vigente y se mueve en cada reinicio
    // (ver anclaCicloPlan / cicloPlanDesde en @/lib/helpers/clientes): con ella,
    // un cliente de dos años que reactivó ayer contaba como cliente de un día,
    // justo al revés de lo que dice la etiqueta del filtro. Y el
    // `!c.fechaContratacion` dejaba fuera en silencio a los 389 clientes con
    // plan que no tienen ancla guardada (carga histórica del mesón).
    if (f.clienteDesdeDiasMin && diasDesde(c.creadoEn) < Number(f.clienteDesdeDiasMin)) return false;
    if (q && !c.nombre.toLowerCase().includes(q) && !c.patente.toLowerCase().includes(q)) return false;
    return true;
  });
}
