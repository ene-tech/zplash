import type { CanalPromo, CanalTramoPromo, Cliente, ConfigGlobal, Precios, PreciosTamano, TamanoVehiculo, Venta } from "@/types";
import { diasVencido } from "./clientes";

/** Plan que se vende hoy: 5 pasadas por túnel dentro del ciclo (ver pasesIncluidos). */
export const PLAN_X5 = "Plan X5";

/** Plan ilimitado, vendido hasta que apareció el X5. Sigue siendo el valor de
 * `clientes.plan` de los 1.072 que lo contrataron antes, y esa string ES la
 * marca de que no tienen tope — por eso no se borra ni de acá ni de la tabla
 * `precios` (ver pasesIncluidos). Un cliente migra al tope recién el día que
 * su `plan` pasa a decir PLAN_X5, no antes. */
export const PLAN_ILIMITADO_LEGACY = "Plan Ilimitado Mensual";

export const PLANES = [PLAN_X5];

/** Pasadas por túnel incluidas en el ciclo de 30 días del plan vigente (las
 * cuenta visitasPeriodoPlan en ./ingresos). */
export const PASES_INCLUIDOS_X5 = 5;

/** Pasadas incluidas en el ciclo según el plan del cliente; null = sin tope
 * (PLAN_ILIMITADO_LEGACY y cualquier plan anterior al X5). */
export function pasesIncluidos(plan: string | null | undefined): number | null {
  return plan === PLAN_X5 ? PASES_INCLUIDOS_X5 : null;
}

export const PRECIOS_DEFAULT: Precios = {
  [PLAN_X5]: { normal: 21990, promo: 19990 },
  [PLAN_ILIMITADO_LEGACY]: { normal: 21990, promo: 19990 },
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

/**
 * Precio del lavado full túnel ADICIONAL: lo que paga un cliente con plan con
 * tope vigente (Plan X5, ver pasesIncluidos) que ya gastó las
 * PASES_INCLUIDOS_X5 pasadas de su ciclo y quiere pasar igual dentro del mes.
 * Más barato que el lavado único de lista (PRECIO_LAVADO_UNICO), que sigue
 * siendo el precio de quien NO tiene plan vigente.
 */
export const PRECIO_LAVADO_ADICIONAL = 3990;

/** Clave usada dentro de Precios para guardar el valor editable del lavado adicional. */
export const LAVADO_ADICIONAL_KEY = "Lavado adicional (con plan vigente)";

/** Precio vigente del lavado full túnel adicional, editable por el administrador; si no se ha guardado uno, usa el valor por defecto. */
export function precioLavadoAdicional(precios: Precios): number {
  return (precios[LAVADO_ADICIONAL_KEY] && precios[LAVADO_ADICIONAL_KEY].normal) || PRECIO_LAVADO_ADICIONAL;
}

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
export const PLAN_ONECLICK_KEY = `${PLAN_X5} (Renovación Automática)`;

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

/**
 * Monto adicional (sobre el lavado único ya pagado) para convertir la visita
 * de hoy en la contratación del Plan X5 — promoción ofrecida
 * dentro de la ventana configurada (ver ConfigGlobal.horasVentanaUpgradePlan),
 * tanto en el módulo Operador como en Mi Cuenta.
 *
 * Es lo que falta para completar el precio del plan contra lo que el cliente
 * REALMENTE pagó por ese lavado (`ventaUpgrade.precio`), no contra el precio
 * de lista: el lavado pudo salir más barato por el cupón de descuento de
 * primera vez (ver emitirCuponDescuentoPrimeraVez), por una promo de WhatsApp,
 * o por tener el canal Web su propio precio (ver LAVADO_UNICO_WEB_KEY). Con un
 * monto adicional fijo ese descuento se regalaba dos veces — el cliente con
 * cupón terminaba entrando al plan por menos que el que no lo tenía.
 *
 * El precio a completar es el de contratación (ver precioContratacion): quien
 * nunca tuvo plan entra por el valor de 1ra contratación, igual que si lo
 * contratara derecho, y el que dejó vencer el suyo por el normal. `cliente` es
 * obligatorio a propósito: el upgrade siempre nace de una venta de un cliente
 * que ya existe, y en precioContratacion omitirlo significa "cliente nuevo".
 */
export function precioUpgradePlan(precios: Precios, ventaUpgrade: Venta, cliente: Pick<Cliente, "vencimiento">): number {
  return Math.max(0, precioContratacion(precios, PLANES[0], cliente) - ventaUpgrade.precio);
}

/**
 * Venta de "Lavado único" del cliente elegible para convertirse en
 * contratación del Plan X5 vía la promoción de upgrade: la más
 * reciente, y solo si ocurrió hace menos de `horasVentana` (ver
 * ConfigGlobal.horasVentanaUpgradePlan) — pasada esa ventana el lavado ya se
 * disfrutó sin plan y la promoción deja de tener sentido.
 *
 * Cuenta tanto un "Lavado único" presencial como un "Lavado único (Web)"
 * (ver LAVADO_UNICO_WEB_TIPO) YA CANJEADO (`canjeadaEn` presente, ver
 * registrarIngresoLavadoWeb en @/lib/logic/ingresos) — recién ahí el cliente
 * efectivamente pasó por el túnel sin plan, mismo hecho que dispara la
 * promoción para el presencial. Uno sin canjear sigue siendo un vale
 * pendiente de usar (ver ventaLavadoWebPendiente): ofrecerle el upgrade
 * antes de eso dejaría ese vale huérfano, sin nadie que lo canjee.
 */
export function ventaUpgradeElegible(
  ventas: Venta[],
  clienteId: string,
  horasVentana: number,
  ahora: Date = new Date()
): Venta | undefined {
  const ultima = ventas
    .filter(
      (v) =>
        v.clienteId === clienteId &&
        (v.tipo === LAVADO_UNICO_KEY || (v.tipo === LAVADO_UNICO_WEB_TIPO && !!v.canjeadaEn))
    )
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

/** Cantidad mínima de tickets de lavado vendibles online (tarjeta "10 Tickets
 * de Lavado" en Tipo de Lavados) — reemplaza a los 4 tiers fijos de
 * PACKS_EMPRESA (10/20/30/40) que existían cuando este producto vivía en la
 * zona "Venta Empresa", ya retirada. Desde acá el cliente puede comprar
 * cualquier cantidad entera igual o mayor a esta, al mismo precio unitario. */
export const CANTIDAD_MINIMA_TICKETS = 10;

/** Tope superior de una sola compra online de tickets: los 4 tiers fijos que
 * reemplaza esto topaban en 40, pero un cliente de flota legítimo puede
 * necesitar bastante más — este límite existe solo para que una cantidad
 * absurda (typo o intento de abuso, ej. 500.000) no dispare un cobro gigante
 * por Transbank ni un insert masivo de cupones en una sola transacción (ver
 * aplicarPagoPackEmpresa, que genera `cantidad` filas sincrónicamente). */
export const CANTIDAD_MAXIMA_TICKETS = 500;

/** Precio IVA incluido de los `CANTIDAD_MINIMA_TICKETS` tickets base, mientras
 * el administrador no lo edite desde Web Settings. */
export const PRECIO_TICKETS_10_DEFAULT = 79990;

/** Clave usada dentro de Precios para guardar el valor editable del pack base de tickets. */
export const TICKETS_KEY = "Pack Tickets 10";

/** Precio unitario vigente de un ticket de lavado, editable por el administrador vía el precio del pack base; si no se ha guardado uno, cae a PRECIO_TICKETS_10_DEFAULT / CANTIDAD_MINIMA_TICKETS. */
export function precioTicketUnitario(precios: Precios): number {
  // `!= null` (no un simple `||`): un admin que guarda $0 a propósito (ej.
  // una promo puntual) es un valor configurado válido, no "todavía no
  // configuré nada" — con `||` ese 0 se perdía y se cobraba igual el default.
  const configurado = precios[TICKETS_KEY]?.normal;
  const precio10 = configurado != null ? configurado : PRECIO_TICKETS_10_DEFAULT;
  return precio10 / CANTIDAD_MINIMA_TICKETS;
}

/** Precio total por comprar `cantidad` tickets (debe ser un entero entre CANTIDAD_MINIMA_TICKETS y CANTIDAD_MAXIMA_TICKETS, si no retorna 0). */
export function precioTickets(precios: Precios, cantidad: number): number {
  if (!Number.isInteger(cantidad) || cantidad < CANTIDAD_MINIMA_TICKETS || cantidad > CANTIDAD_MAXIMA_TICKETS) return 0;
  return Math.round(precioTicketUnitario(precios) * cantidad);
}

export function fmtCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function precioNormal(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].normal) || 0;
}

/**
 * Aplica el precio heredado de un cliente (ver `precioPlanHeredado` en
 * db/schema/clientes.ts) sobre el precio de plan que le tocaría hoy: si venía
 * pagando menos que el valor vigente, se le respeta ese valor mientras siga
 * renovando ANTES de que se le venza el plan.
 *
 * Nunca sube el precio: un heredado mayor o igual al vigente se ignora (pasa
 * cuando el precio de lista bajó, o cuando quedó guardado el monto de un pago
 * de más de un mes). Se aplica a cualquier precio de plan del cliente —
 * renovación normal, tramo promocional de la escala, y el cobro mensual de la
 * renovación automática Oneclick (ver cobrarSuscripcion) — para que un mismo
 * cliente no vea un precio distinto según por dónde pague.
 *
 * NO se aplica a una contratación nueva (`plan_nuevo`/contratarPlan) ni a la
 * reactivación de un plan ya vencido: ahí el cliente dejó de renovar a tiempo
 * y entra con el precio vigente o con la promoción de reactivación que
 * corresponda. Quién sigue "a tiempo" lo decide enPlazoDePagoPlan (que además
 * perdona los días de gracia de pago atrasado); esta función solo aplica el
 * número.
 */
export function precioConHeredado(precioVigente: number, cliente: Pick<Cliente, "precioPlanHeredado">): number {
  const heredado = cliente.precioPlanHeredado;
  return heredado != null && heredado > 0 && heredado < precioVigente ? heredado : precioVigente;
}

/**
 * true mientras al cliente le corresponda pagar su plan como una renovación
 * hecha a tiempo: plan todavía vigente, o vencido hace no más de `diasGracia`
 * (ver ConfigGlobal.diasGraciaPagoAtrasado, editable en Configuración → Pago
 * de plan atrasado). Dentro de esa ventana el pago atrasado conserva las dos
 * cosas que el cliente pierde al vencerse: su precio de contratación (ver
 * precioPagoAtrasado) y su fecha de vencimiento original (ver renovarPlan en
 * @/lib/logic), que sigue corriendo desde donde estaba en vez de arrancar de
 * cero hoy. Pasado el plazo entra por el precio vigente, como cualquier
 * reactivación.
 *
 * Un cliente sin plan (`vencimiento` nulo) cuenta como "en plazo": no hay
 * atraso que penalizar, y de todas formas no tiene precio heredado que
 * respetar.
 */
export function enPlazoDePagoPlan(cliente: Pick<Cliente, "vencimiento">, diasGracia: number, ahora?: Date): boolean {
  const dias = diasVencido(cliente, ahora);
  return dias === null || dias <= diasGracia;
}

/**
 * Precio de pagar el plan de una patente, único para la pantalla que lo
 * anuncia y para el endpoint que lo cobra: con el plan vigente es la
 * renovación de siempre (precio normal con su heredado) y con el plan ya
 * vencido manda precioPagoAtrasado — dentro del plazo de gracia el precio que
 * pagaría a tiempo, pasado el plazo el de lista.
 *
 * Existe porque tenerlo calculado en dos lados terminó en lo peor que puede
 * pasar en un checkout: Mi Cuenta le mostraba al cliente vencido el precio
 * preferencial y /api/pagos/webpay/crear le cobraba el de lista. Cualquier
 * superficie nueva que muestre o cobre "renovación" tiene que llamar a esta
 * función y no rearmar el cálculo.
 */
export function precioRenovacionCliente(
  precios: Precios,
  plan: string,
  cliente: Pick<Cliente, "vencimiento" | "precioPlanHeredado">,
  diasGracia: number
): number {
  if (diasVencido(cliente) !== null) return precioPagoAtrasado(precios, plan, cliente, diasGracia);
  // Con plan vigente esto es renovar a tiempo, que vale el preferencial (ver
  // precioRenovacionATiempo) — no el de lista. Una patente sin plan no está
  // renovando nada: ahí se queda en el normal, que es el respaldo defensivo
  // de un "renovacion" pedido sobre alguien que en realidad tiene que
  // contratar (ver precioContratacion).
  return cliente.vencimiento
    ? precioRenovacionATiempo(precios, plan, cliente)
    : precioConHeredado(precioNormal(precios, plan), cliente);
}

/**
 * Precio de pagar un plan YA VENCIDO: dentro del plazo de gracia (ver
 * enPlazoDePagoPlan) es lo mismo que le habría costado renovar a tiempo — el
 * precio preferencial cargado del plan (Precios[plan].promo, que es lo que
 * efectivamente paga hoy quien renueva; el `normal` funciona como precio de
 * lista) con su precio heredado respetado. Pasado el plazo paga el normal:
 * ahí sí perdió el precio de cliente al día.
 *
 * A propósito NO usa los tramos de renovación anticipada (ver
 * precioRenovacionLocal): esos premian pagar ANTES de que venza, y este
 * cliente ya pagó tarde — se le respeta su precio de siempre, no se le regala
 * además el descuento por anticiparse.
 */
export function precioPagoAtrasado(
  precios: Precios,
  plan: string,
  cliente: Pick<Cliente, "vencimiento" | "precioPlanHeredado">,
  diasGracia: number
): number {
  if (!enPlazoDePagoPlan(cliente, diasGracia)) return precioNormal(precios, plan);
  return precioRenovacionATiempo(precios, plan, cliente);
}

/**
 * Lo que paga por renovar quien llega a tiempo: el precio preferencial del
 * plan (Precios[plan].promo, el mismo respaldo que usa precioRenovacionLocal
 * cuando el canal no tiene tramos cargados), con su precio heredado
 * respetado.
 *
 * El `normal` NO es este precio: es el de lista, y lo paga solo quien perdió
 * el plazo — el vencido fuera de los días de gracia (precioPagoAtrasado) y el
 * que vuelve a contratar después de dejarlo vencer (precioContratacion). Que
 * "renovar a tiempo" se calculara con el normal en unos lados y con el
 * preferencial en otros hacía que pagar tarde saliera MÁS BARATO que pagar
 * antes de vencer, y que Mi Cuenta le anunciara al cliente un precio de
 * renovación que no era el que después se le cobraba.
 */
export function precioRenovacionATiempo(
  precios: Precios,
  plan: string,
  cliente: Pick<Cliente, "precioPlanHeredado">
): number {
  return precioConHeredado(precioPreferencial(precios, plan) || precioNormal(precios, plan), cliente);
}

export function precioPreferencial(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].promo) || 0;
}

/** Clave dentro de Precios del valor de la PRIMERA contratación de un plan
 * (ver precioContratacion) — una fila más de `precios`, igual que
 * PLAN_ONECLICK_KEY, no una columna nueva. */
export const keyPrimeraContratacion = (plan: string) => `${plan} (1ra contratación)`;

/**
 * Precio de contratar un plan (venta "Plan nuevo" en el local, tipo
 * "plan_nuevo" en la web): el valor de 1ra contratación cuando el cliente
 * nunca tuvo plan — `vencimiento` nulo, incluida la patente que todavía no
 * existe en la base (`cliente` sin pasar) — y el precio normal para el que
 * vuelve después de dejar vencer el suyo: ese ya no es un cliente nuevo y
 * tiene su propia promoción de reactivación (ver precioReactivacionVencido).
 *
 * Sin valor de 1ra contratación cargado ($0) cae al precio normal, que es el
 * comportamiento previo a que este precio existiera. Es solo el precio de
 * entrada: la renovación siguiente vale el normal, porque contratar no
 * escribe `precioPlanHeredado` (ver precioConHeredado).
 */
export function precioContratacion(precios: Precios, plan: string, cliente?: Pick<Cliente, "vencimiento"> | null): number {
  const primera = precios[keyPrimeraContratacion(plan)]?.normal || 0;
  return !cliente?.vencimiento && primera > 0 ? primera : precioNormal(precios, plan);
}

/**
 * Precio de renovación preferencial anticipada (plan todavía vigente) para un
 * cliente, según cuántas veces pasó durante su período de plan vigente (ver
 * tramosRenovacionLocal en ConfigGlobal y visitasPeriodoPlan en
 * helpers/ingresos — NO el total histórico de Cliente.visitas): busca el
 * tramo cuyo rango [visitasMin, visitasMax] contiene `visitasPeriodo`
 * (evaluando los tramos ordenados de menor a mayor visitasMin, para que el
 * resultado sea determinístico aunque el admin los haya guardado en otro
 * orden).
 *
 * `canal` es el canal QUE PREGUNTA ("LOCAL" = módulo Operador, "WEB" = Mi
 * Cuenta / pagar): solo califican los tramos de ese canal o sin restricción
 * ("AMBOS", también los guardados antes de que existiera el campo) — así se
 * puede invitar a renovar online a un precio que el operador no puede cobrar
 * en el local. Ante rangos que se pisan gana el tramo del canal específico
 * por sobre el "AMBOS", igual que en precioReactivacionVencido.
 *
 * `undefined` = no corresponde ofrecer promoción, el cliente renueva al precio
 * normal: es lo que deja fuera al que viene mucho (queda sobre el visitasMax
 * del último tramo). El precio preferencial general (Precios[plan].promo)
 * sigue siendo el respaldo SOLO cuando ese canal no tiene ningún tramo
 * configurado, que es el comportamiento previo a que existiera la escala.
 */
function tramosRenovacionLocalPorCanal(config: ConfigGlobal, plan: string, canal: CanalPromo) {
  return (config.tramosRenovacionLocal[plan] || [])
    .filter((t) => canalTramo(t) === "AMBOS" || canalTramo(t) === canal)
    .sort((a, b) => a.visitasMin - b.visitasMin || Number(canalTramo(a) === "AMBOS") - Number(canalTramo(b) === "AMBOS"));
}

export function precioRenovacionLocal(
  config: ConfigGlobal,
  precios: Precios,
  plan: string,
  visitasPeriodo: number,
  canal: CanalPromo
): number | undefined {
  const tramos = tramosRenovacionLocalPorCanal(config, plan, canal);
  if (!tramos.length) return precioPreferencial(precios, plan);
  const match = tramos.find((t) => visitasPeriodo >= t.visitasMin && (t.visitasMax === null || visitasPeriodo <= t.visitasMax));
  return match?.precio;
}

/**
 * true solo cuando un tramo real de la escala de renovación anticipada calza
 * para este cliente y canal — a diferencia de `precioRenovacionLocal`, NO
 * cuenta como "promoción vigente" el respaldo al precio preferencial general
 * (Precios[plan].promo) que se usa cuando el canal todavía no tiene ningún
 * tramo configurado: eso no es una promoción real por tramos, es que la
 * escala no se ha cargado. Usado por condicionSoloConPromoRenovacion (ver
 * @/lib/mailing/reglas/cron) para no invitar con "precio preferencial" a
 * quien en realidad no tiene ningún tramo vigente.
 */
export function tramoRenovacionVigente(config: ConfigGlobal, plan: string, visitasPeriodo: number, canal: CanalPromo): boolean {
  return tramosRenovacionLocalPorCanal(config, plan, canal).some(
    (t) => visitasPeriodo >= t.visitasMin && (t.visitasMax === null || visitasPeriodo <= t.visitasMax)
  );
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
 *
 * `canal` es el canal QUE PREGUNTA ("LOCAL" = módulo Operador, "WEB" = Mi
 * Cuenta / pagar): solo califican los tramos de ese canal o sin restricción
 * ("AMBOS", también los guardados antes de que existiera el campo). Así una
 * promoción marcada "WEB" no se puede cobrar en el local — el Operador igual
 * la ve, consultando aparte por el canal Web, para poder mencionársela al
 * cliente (ver useOperadorFoundResult). Ante rangos que se pisan gana el
 * tramo del canal específico por sobre el "AMBOS", para que una promo
 * dirigida a un canal le pueda mejorar el precio general.
 */
export function precioReactivacionVencido(
  config: ConfigGlobal,
  plan: string,
  diasVencido: number,
  visitas: number,
  canal: CanalPromo
): number | undefined {
  const tramos = [...(config.tramosReactivacionVencido[plan] || [])].sort(
    (a, b) =>
      a.diasVencidoMin - b.diasVencidoMin ||
      a.visitasMin - b.visitasMin ||
      Number(canalTramo(a) === "AMBOS") - Number(canalTramo(b) === "AMBOS")
  );
  const match = tramos.find(
    (t) =>
      (canalTramo(t) === "AMBOS" || canalTramo(t) === canal) &&
      diasVencido >= t.diasVencidoMin &&
      (t.diasVencidoMax === null || diasVencido <= t.diasVencidoMax) &&
      visitas >= t.visitasMin &&
      (t.visitasMax === null || visitas <= t.visitasMax)
  );
  return match?.precio;
}

/** Canal habilitado en un tramo, con el default de los tramos guardados antes de que el campo existiera. */
export function canalTramo(tramo: { canal?: CanalTramoPromo }): CanalTramoPromo {
  return tramo.canal ?? "AMBOS";
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
