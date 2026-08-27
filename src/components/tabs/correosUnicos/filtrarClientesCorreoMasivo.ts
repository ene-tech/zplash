import { diasVencido, normPlate, planStatus, visitasUltimoPeriodoVencido } from "@/lib/helpers";
import type { Cliente, Ingreso } from "@/types";

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
  pasadasMin: string;
  pasadasMax: string;
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
  autopago?: Map<string, EstadoAutopago> | null,
  ingresos?: Ingreso[]
): Cliente[] {
  const q = f.busqueda.trim().toLowerCase();
  const filtraPasadas = !!(f.pasadasMin.trim() || f.pasadasMax.trim());
  if (f.filtroAutopago !== "todos" && !autopago) return [];
  // Mismo criterio que con el mapa de autopago: sin el historial cargado todos
  // darían 0 pasadas y entrarían enteros a un rango que empiece en 0.
  if (filtraPasadas && !ingresos) return [];
  // Rango de pasadas del último período que el cliente SÍ pagó — el mismo eje
  // con el que argumenta {{pasadas}} en la plantilla y contra el que filtra
  // condicionPasadasMax en las reglas automáticas (ver @/db/schema/mailReglas):
  // al que pasaba poco el plan le cubre el uso y le baja el precio; al que
  // pasaba más ese texto le ofrece MENOS lavados de los que usaba.
  // Los ingresos se agrupan por cliente una sola vez porque
  // visitasUltimoPeriodoVencido recorre TODO el historial por cliente, y acá
  // se filtra sobre miles de clientes contra decenas de miles de ingresos.
  const ingresosPorCliente = new Map<string, Ingreso[]>();
  if (filtraPasadas) {
    for (const i of ingresos ?? []) {
      const lista = ingresosPorCliente.get(i.clienteId);
      if (lista) lista.push(i);
      else ingresosPorCliente.set(i.clienteId, [i]);
    }
  }
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
    if (filtraPasadas) {
      // Sin vencimiento no hay "último período pagado" que contar: contaría 0
      // pasadas y entraría a cualquier rango que empiece en 0, mezclando al que
      // nunca tuvo plan con el que pagaba y pasaba poco — mismo criterio que
      // "Vencido hace máximo" arriba.
      if (!c.vencimiento) return false;
      const pasadas = visitasUltimoPeriodoVencido(ingresosPorCliente.get(c.id) ?? [], c);
      if (f.pasadasMin.trim() && pasadas < Number(f.pasadasMin)) return false;
      if (f.pasadasMax.trim() && pasadas > Number(f.pasadasMax)) return false;
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
