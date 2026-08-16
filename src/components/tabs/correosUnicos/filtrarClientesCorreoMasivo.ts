import { diasVencido, normPlate, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

/**
 * Estado del cobro automático (Oneclick) de una patente, derivado de
 * suscripcionesParaFiltroCorreo() — ver el useEffect que lo carga en
 * WebSettingsCorreosUnicosTab. `estado` es el de la suscripción
 * (activa/suspendida/pendiente/cancelada) y `ultimoCobroRechazado` mira el
 * último intento de cobro, que es lo que de verdad define a quién le calza un
 * correo del tipo "no pudimos cobrar tu suscripción".
 */
export interface EstadoAutopago {
  estado: string;
  ultimoCobroRechazado: boolean;
}

export interface FiltrosCorreoMasivo {
  filtroEstado: string;
  filtroOrigen: string;
  vencidoDiasMax: string;
  filtroAutopago: string;
  busqueda: string;
}

/**
 * Selección de destinatarios para el envío puntual por correo (Web Settings →
 * Correos Únicos). Deliberadamente más chico que el de WhatsApp
 * (filtrarClientesMensajeMasivo, que además segmenta por conducta de compra):
 * acá los ejes que importan son el momento del ciclo de plan y si el cobro
 * automático corrió o no, porque es lo que hace verdadero o falso el contenido
 * de una plantilla transaccional.
 *
 * `autopago` es el mapa patente → EstadoAutopago; llega `null` mientras la
 * consulta está en vuelo. Con un filtro de autopago activo y el mapa sin
 * cargar se devuelve lista vacía a propósito (en vez de ignorar el filtro):
 * que no se pueda enviar nada es preferible a mostrar "todos los vencidos web"
 * como si fueran los que tienen cobro automático y que el admin apriete enviar
 * sobre el grupo equivocado.
 */
export function filtrarClientesCorreoMasivo(
  clientes: Cliente[],
  f: FiltrosCorreoMasivo,
  autopago?: Map<string, EstadoAutopago> | null
): Cliente[] {
  const q = f.busqueda.trim().toLowerCase();
  if (f.filtroAutopago !== "todos" && !autopago) return [];
  return clientes.filter((c) => {
    if (f.filtroEstado !== "todos" && planStatus(c).label !== f.filtroEstado) return false;
    if (f.filtroOrigen !== "todos" && (c.origen || "LOCAL") !== f.filtroOrigen) return false;
    // Tope de días de vencido: deja adentro solo a quienes efectivamente
    // tienen el plan vencido (diasVencido devuelve null si está vigente o sin
    // plan), acotando qué tan atrás. Sirve para no mezclar al que venció hace
    // 3 días con el que venció hace 8 meses en un mismo envío.
    if (f.vencidoDiasMax.trim()) {
      const dias = diasVencido(c);
      if (dias === null || dias > Number(f.vencidoDiasMax)) return false;
    }
    if (f.filtroAutopago !== "todos") {
      const info = autopago!.get(normPlate(c.patente));
      // "sin" incluye tanto al que nunca inscribió tarjeta como al que la
      // canceló/suspendió: a ninguno de los dos lo va a renovar el cron solo.
      if (f.filtroAutopago === "activo" && info?.estado !== "activa") return false;
      if (f.filtroAutopago === "sin" && info?.estado === "activa") return false;
      if (f.filtroAutopago === "cobro_rechazado" && (!info?.ultimoCobroRechazado || info.estado === "cancelada")) return false;
    }
    if (q && !c.nombre.toLowerCase().includes(q) && !c.patente.toLowerCase().includes(q)) return false;
    return true;
  });
}
