// Bloqueo horario del módulo Operador (registro de ingresos): fuera de estos
// rangos, solo perfiles exentos (ver esExentoHorarioOperador en helpers.ts —
// hoy equivale a "tiene acceso a Configuración", es decir Administración y
// Gerencia) pueden registrar el ingreso de un vehículo. festivos es una lista
// de fechas YYYY-MM-DD que se tratan con el horario de fin de semana.
/**
 * Canal por el que un cliente puede tomar una promoción: "LOCAL" es el módulo
 * Operador (se la cobra el operador en el local) y "WEB" las superficies
 * online (Mi Cuenta / pagar, y el correo que las enlaza). No confundir con
 * Cliente.origen, que dice por dónde ENTRÓ el cliente: un cliente de origen
 * Local igual puede tomar una promoción por el canal Web desde Mi Cuenta.
 */
export type CanalPromo = "WEB" | "LOCAL";

/** Canal habilitado en un tramo de promoción: uno puntual, o "AMBOS" = sin restricción de canal. */
export type CanalTramoPromo = CanalPromo | "AMBOS";

/**
 * Un tramo de la escala de renovación preferencial anticipada (plan todavía
 * vigente, ver tramosRenovacionLocal en ConfigGlobal): el rango de pasadas
 * del período de plan VIGENTE (ver visitasPeriodoPlan — no el total histórico
 * acumulado en Cliente.visitas, mismo criterio "por período" que
 * TramoReactivacionVencido), con visitasMax null = sin tope superior (último
 * tramo abierto, ej. "5 o más pasadas").
 *
 * `canal` restringe por dónde se puede tomar ese precio (ver
 * precioRenovacionLocal): "WEB" lo deja disponible solo en Mi Cuenta / pagar
 * — el Operador no lo puede cobrar, solo mencionarlo — y "LOCAL" solo en el
 * módulo Operador. Ausente = "AMBOS", el comportamiento de los tramos
 * guardados antes de que existiera esta opción.
 */
export interface TramoRenovacionLocal {
  id: string;
  visitasMin: number;
  visitasMax: number | null;
  precio: number;
  canal?: CanalTramoPromo;
}

/**
 * Un tramo de la escala de reactivación preferencial para clientes (Local o
 * Web) con el plan vencido hace poco (ver tramosReactivacionVencido en
 * ConfigGlobal): dos rangos independientes, días vencido y visitas del
 * último período vigente (no el histórico acumulado) — ambos con máximo
 * null = sin tope superior.
 *
 * `canal` restringe por dónde se puede tomar ese precio (ver
 * precioReactivacionVencido): "WEB" lo deja disponible solo en Mi Cuenta /
 * pagar y el Operador no puede cobrarlo (solo se le avisa que el cliente lo
 * tiene, para que se lo mencione), "LOCAL" solo en el módulo Operador.
 * Ausente = "AMBOS", el comportamiento de los tramos guardados antes de que
 * existiera esta opción.
 */
export interface TramoReactivacionVencido {
  id: string;
  diasVencidoMin: number;
  diasVencidoMax: number | null;
  visitasMin: number;
  visitasMax: number | null;
  precio: number;
  canal?: CanalTramoPromo;
}

import type { TextosBotWhatsapp } from "./whatsapp";
import type { TramoDotacion } from "./funcionario";

export interface ConfigGlobal {
  horarioOperadorSemanaInicio: string;
  horarioOperadorSemanaFin: string;
  horarioOperadorFindeInicio: string;
  horarioOperadorFindeFin: string;
  festivos: string[];
  // Días de vigencia de los tickets del Pack de Tickets (ver TICKETS_KEY en
  // helpers/precios.ts), editable en Web Settings — a propósito no amarrado a
  // los 90 días fijos de otros productos.
  vigenciaDiasPackEmpresa: number;
  // Escala de precio de renovación preferencial anticipada (plan vigente, aún
  // sin vencer) según cuántas veces pasó el cliente durante su período de plan
  // vigente, keyed por plan (mismo patrón que Precios) — permite ofrecer, por
  // ejemplo, un precio más bajo a quien pasó 0 o 1 vez que a uno que viene
  // seguido. Cada tramo puede quedar restringido a un canal (ver canal en
  // TramoRenovacionLocal), para invitar a renovar online a precio preferencial
  // sin que ese mismo precio se pueda cobrar en el local. Si hay tramos para el
  // canal que pregunta y ninguno le calza, NO se ofrece promoción (paga el
  // precio normal); el precio preferencial general (Precios[plan].promo) queda
  // como respaldo solo cuando ese canal no tiene ningún tramo configurado —
  // ver precioRenovacionLocal.
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
  // tramo sigue viendo su oferta de renovar al último valor pagado. Cada
  // tramo puede además quedar restringido a un canal (ver canal en
  // TramoReactivacionVencido).
  tramosReactivacionVencido: Record<string, TramoReactivacionVencido[]>;
  // Días de atraso que se le perdonan a un cliente para pagar su plan ya
  // vencido como si hubiera renovado a tiempo (ver enPlazoDePagoPlan en
  // @/lib/helpers): dentro de esa ventana conserva su precio de contratación
  // (el heredado, ver precioPlanCliente) y su fecha de vencimiento original —
  // el ciclo sigue corriendo desde donde estaba, no arranca de cero hoy.
  // Pasado el plazo paga el precio vigente, como cualquier reactivación.
  diasGraciaPagoAtrasado: number;
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
  // Firma HTML del gestor de correo (ver @/types/buzon) — vacía por defecto.
  firmaCorreo: string;
  // Ubicación del local (coordenadas) y radio en metros dentro del cual una
  // marca del libro de asistencia se considera hecha "en el local" (ver
  // MarcaAsistencia y distanciaMetros en @/lib/helpers/funcionario).
  // undefined = sin configurar: las marcas se guardan con su posición pero
  // sin veredicto.
  localLat?: number;
  localLng?: number;
  radioAsistenciaMetros: number;
  // Dotación: cuántos operadores necesita el local por franja horaria y día
  // (ver TramoDotacion). Se edita en Horarios y Turnos y la respeta el creador
  // de horario. Vacía = sin requerimiento, el horario se arma solo con los
  // cuatro encargados de apertura y cierre.
  dotacion: TramoDotacion[];
}
