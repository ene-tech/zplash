import type { Cliente, ClientePatch, Ingreso, PlanStatus } from "@/types";
import { ahoraEnSantiago, diaEnSantiago, sumarMesesFecha } from "./fechas";
import { normPlate } from "./validadores";

export const DIAS_AVISO_VENCIMIENTO = 7;

export function findClient(clientes: Cliente[], plate: string): Cliente | undefined {
  return clientes.find((c) => normPlate(c.patente) === normPlate(plate));
}

/** La carga masiva por Excel deja "Sin nombre" quemado cuando la fila no trae nombre. */
export function esNombreVacio(nombre: string | undefined | null): boolean {
  return !nombre || !nombre.trim() || nombre.trim().toLowerCase() === "sin nombre";
}

export type PlateEstadoCls = "ok" | "warn" | "bad" | "info";

/**
 * Color del texto de la patente según el estado del cliente — variante de
 * planStatus() con un cuarto valor ("info", azul) para distinguir "Sin plan"
 * de "Vencido": ambos comparten cls "bad" en planStatus (mismo tratamiento
 * para lógica de negocio, p.ej. bloquear ingreso), pero visualmente son
 * estados distintos y conviene poder diferenciarlos de un vistazo en listas.
 */
export function plateEstadoCls(c: Pick<Cliente, "vencimiento">): PlateEstadoCls {
  if (!c.vencimiento) return "info";
  return planStatus(c).cls;
}

export function planStatus(c: Pick<Cliente, "vencimiento">): PlanStatus {
  if (!c.vencimiento) return { label: "Sin plan", cls: "bad" };
  // ahoraEnSantiago() en vez de `new Date()`: esta función se llama tanto
  // desde el navegador (hora de Chile) como desde rutas de servidor
  // (/api/pagos/estado, el bot de WhatsApp) que en producción corren en UTC
  // — sin normalizar, un mismo cliente podía verse "Vigente" en la pantalla
  // del operador y "Vencido" en WhatsApp durante varias horas alrededor de
  // la medianoche en Chile (mismo bug que ya se corrigió para el bloqueo
  // horario del módulo Operador, ver dentroDeHorarioOperador).
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  if (venc < hoy) return { label: "Vencido", cls: "bad" };
  const diff = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
  if (diff <= DIAS_AVISO_VENCIMIENTO) return { label: "Por vencer", cls: "warn", diasRestantes: diff };
  return { label: "Vigente", cls: "ok" };
}

/**
 * Ciclo de plan, en días. El ciclo real es un mes calendario (ver
 * finCicloPlan), así que esto es solo la aproximación que usa la barra de
 * progreso: no sirve para calcular vencimientos.
 */
export const DURACION_PLAN_DIAS = 30;

/**
 * Porcentaje del ciclo de plan que le queda al cliente, para la
 * barra de progreso de la lista de clientes: 100% recién renovado, 0% el día
 * del vencimiento. Se satura en 100 si el vencimiento quedó más lejos que un
 * ciclo completo (p.ej. un plan cargado manualmente a futuro) y en 0 tras
 * vencido. `null` sin plan asociado (mismo caso que planStatus "Sin plan").
 */
export function planProgreso(c: Pick<Cliente, "vencimiento">, ahora: Date = ahoraEnSantiago()): number | null {
  if (!c.vencimiento) return null;
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  venc.setHours(0, 0, 0, 0);
  const diasRestantes = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
  return Math.max(0, Math.min(100, Math.round((diasRestantes / DURACION_PLAN_DIAS) * 100)));
}

/**
 * Días enteros transcurridos desde que venció el plan (mismo criterio que
 * planStatus: hora de Chile, comparado contra el inicio del día); `null` si
 * el cliente no tiene plan o su plan sigue vigente. Base del eje "hace
 * cuánto se venció" de la promoción de reactivación (ver
 * precioReactivacionVencido en @/lib/helpers/precios).
 */
export function diasVencido(c: Pick<Cliente, "vencimiento">, ahora: Date = ahoraEnSantiago()): number | null {
  if (!c.vencimiento) return null;
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  venc.setHours(0, 0, 0, 0);
  if (venc >= hoy) return null;
  return Math.round((hoy.getTime() - venc.getTime()) / 86400000);
}

/**
 * Arma el patch a guardar para un cliente ya existente: solo los campos donde
 * `siguiente` difiere de `anterior` (la copia que esta sesión leyó por
 * última vez), más `id`. Sin esto, guardar un cliente reenvía la fila
 * completa tal cual la tiene la sesión en memoria — si esa copia quedó
 * desactualizada (otra sesión guardó un cambio distinto mientras tanto), el
 * upsert de fila completa pisa silenciosamente ese cambio ajeno con el valor
 * viejo que esta sesión nunca supo que había cambiado (ver memoria del caso
 * HERNAN, 2026-07-27). Un alta nueva (sin `anterior`) no tiene nada que
 * diffear: se guarda la fila completa, como siempre.
 */
export function patchDeCliente(anterior: Cliente | undefined, siguiente: Cliente): ClientePatch {
  if (!anterior) return siguiente;
  const patch: ClientePatch = { id: siguiente.id };
  const campos = new Set([...Object.keys(anterior), ...Object.keys(siguiente)]) as Set<keyof Cliente>;
  for (const campo of campos) {
    if (campo === "id") continue;
    if (siguiente[campo] !== anterior[campo]) (patch as Record<string, unknown>)[campo] = siguiente[campo];
  }
  return patch;
}

/**
 * Resuelve si un cambio de patente pendiente (solicitado desde el módulo
 * Clientes o desde Mi Cuenta, ver `patentePendiente`/`patentePendienteDesde`
 * en @/db/schema/clientes) debe aplicarse en esta escritura: solo cuando
 * `vencimiento` avanza a una fecha estrictamente posterior a la que tenía
 * `anterior` en la base — eso es lo que distingue una renovación real (nuevo
 * período) de cualquier otra edición de la ficha (nombre, teléfono, o incluso
 * la propia solicitud de cambio, que no toca vencimiento). Si `nuevo` es un
 * patch parcial (ver patchDeCliente) sin `vencimiento`, nunca cuenta como
 * renovación — correcto, ese patch no está tocando el plan.
 *
 * Si no corresponde aplicar todavía, igual se preservan
 * patentePendiente/patentePendienteDesde de `anterior` en el resultado: así
 * un caller que arma su patch a partir de una copia en memoria desactualizada
 * (sin estos campos, ej. un `cliente` cargado antes de esta feature) nunca
 * borra sin querer una solicitud real al guardar cambios de otro tipo.
 *
 * Se usa desde dataAccess/clientes.ts::upsertClientes (con `anterior` recién
 * leído de la base) y replicado a mano en @/lib/pagos/aplicarPagoAprobado
 * (que no pasa por upsertClientes).
 */
export function resolverPatentePendiente(
  anterior: Cliente | undefined,
  nuevo: ClientePatch
): { fila: ClientePatch; patenteAnterior?: string } {
  if (!anterior?.patentePendiente) return { fila: nuevo };

  const vencAnteriorTime = anterior.vencimiento ? new Date(anterior.vencimiento).getTime() : null;
  const vencNuevoTime = nuevo.vencimiento ? new Date(nuevo.vencimiento).getTime() : null;
  const renovado = vencNuevoTime !== null && (vencAnteriorTime === null || vencNuevoTime > vencAnteriorTime);

  if (!renovado) {
    return { fila: { ...nuevo, patentePendiente: anterior.patentePendiente, patentePendienteDesde: anterior.patentePendienteDesde } };
  }

  return {
    fila: { ...nuevo, patente: anterior.patentePendiente, patentePendiente: null, patentePendienteDesde: null },
    patenteAnterior: anterior.patente,
  };
}

/**
 * Vencimiento del ciclo `ciclos`-ésimo de un plan contratado en `inicio`: el
 * día anterior al mismo día del mes siguiente — contratado el 23, vigente
 * hasta el 22 del mes que viene (el 22 completo: planStatus/sigueVigenteHoy
 * comparan por día, no por hora). Cuando el mes destino no tiene ese día
 * (contratado un 31), cae en el último día del mes.
 *
 * `ciclos` se cuenta siempre desde la contratación en vez de encadenar ciclo
 * sobre ciclo, para que un plan contratado un 31 no vaya perdiendo días cada
 * vez que pasa por un mes corto.
 *
 * El día se resta DESPUÉS de sumar los meses, no antes: restándolo antes, un
 * plan contratado el día 1 anclaba el ciclo en el último día del mes anterior,
 * que puede ser más corto que el mes destino — contratado el 1 de marzo vencía
 * el 28 de marzo (28 feb + 1 mes) en vez del 31, tres días menos de plan. Pasa
 * también, con un día, el 1 de mayo, julio, octubre y diciembre.
 */
export function finCicloPlan(inicio: Date, ciclos = 1): Date {
  const venc = sumarMesesFecha(inicio, ciclos);
  // Cuando sumarMesesFecha ya recortó el día (contratado un 31, mes destino de
  // 30) no se resta nada: es la regla del negocio —"pagué el 31, vigente hasta
  // el 30"—, así que el cliente se queda con ese día.
  // ponytail: el precio es que en esos ciclos el último día vigente coincide
  // con el primero del ciclo siguiente, o sea le reponen las pasadas un día
  // antes. Son las anclas 29/30/31 y es un día; si molesta, la salida es
  // guardar el borde del ciclo en vez de derivarlo del vencimiento.
  if (venc.getDate() === inicio.getDate()) venc.setDate(venc.getDate() - 1);
  return venc;
}

/** Vencimiento de un plan contratado en `desde` (por defecto ahora), como ISO. Kept outside component bodies since it is not a pure computation. */
export function vencimientoPorDefectoISO(desde: Date = new Date()): string {
  return finCicloPlan(desde).toISOString();
}

/**
 * Los DOS campos con que queda un plan cuyo ciclo arranca en `desde`. Se
 * devuelven juntos a propósito: escribir `vencimiento` sin `fechaContratacion`
 * es lo que rompe la ventana de pases, y con un solo spread
 * (`{ ...cliente, ...cicloPlanDesde() }`) no hay forma de acordarse de uno y
 * olvidar el otro.
 *
 * Sin `fechaContratacion`, anclaCicloPlan tiene que DEDUCIR el borde del ciclo
 * del vencimiento (`vencimiento + 1 día`), y esa deducción no es inversa de
 * finCicloPlan cuando el día quedó recortado — anclas 29/30/31 sobre un mes
 * más corto, donde finCicloPlan no resta el día. Caso real (HYRL56,
 * 31-ago-2026): reactivación el 31-ago → vencimiento 30-sep → ancla deducida
 * 1-oct → periodoPlan retrocede de mes en mes y da la ventana [1-ago, 1-sep),
 * o sea el ciclo ANTERIOR, ya gastado. La clienta pagó su mes y el mesón le
 * negó el ingreso con "ya usó las 5 pasadas".
 *
 * No hay forma de arreglarlo del lado de la deducción: un vencimiento 30-sep
 * es igual de compatible con una contratación el 31-ago (recortada) que con
 * una el 1-sep (con el día restado). El dato hay que guardarlo.
 *
 * Solo para ciclos que arrancan de cero. Renovar sobre un plan vigente apila
 * un mes más sobre el MISMO ciclo y ahí `fechaContratacion` no se toca (ver
 * renovarPlan en @/lib/logic/ingresos y vencimientoAnclado acá arriba).
 */
export function cicloPlanDesde(desde: Date = new Date()): { vencimiento: string; fechaContratacion: string } {
  return { vencimiento: vencimientoPorDefectoISO(desde), fechaContratacion: desde.toISOString() };
}

/**
 * true si `vencimiento` sigue vigente HOY (fecha de calendario en Chile, no
 * la hora exacta) — mismo criterio día-granular que planStatus. Evita tratar
 * como "vencido" un plan cuya hora de vencimiento (guardada tal cual quedó
 * en su último cálculo, casi siempre bien entrada la madrugada) ya pasó pero
 * cuya fecha sigue siendo hoy en Chile.
 *
 * Visto en producción (ago-2026, caso CBLH20 y otros): WooCommerce procesaba
 * la renovación de un cliente de noche en Chile — todavía "hoy" en el
 * calendario — pero el webhook comparaba contra `new Date()` (hora exacta),
 * que ya marcaba ese vencimiento como pasado. Eso lo mandaba a
 * vencimientoAnclado() en vez de sumarle un ciclo desde donde estaba, y como
 * vencimientoAnclado() también usa el mismo "hoy" día-granular, el resultado
 * caía en esa misma fecha (ya pasada en hora exacta): el cliente pagaba y
 * quedaba igual de "Vencido" en el sistema.
 */
export function sigueVigenteHoy(vencimiento: string | null | undefined): boolean {
  if (!vencimiento) return false;
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  return new Date(vencimiento) >= hoy;
}

/**
 * Próximo vencimiento manteniendo el ciclo mensual anclado a la fecha de
 * contratación original (avanza mes a mes desde ahí, ver finCicloPlan), en
 * vez de reiniciar el ciclo desde la fecha en que el operador renueva
 * manualmente un cliente Web cuyo pago automático falló.
 */
export function vencimientoAnclado(cliente: Pick<Cliente, "fechaContratacion" | "vencimiento">): string {
  // Mismo motivo que en planStatus: hora de Chile, no la del entorno donde
  // corre esta función.
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  // El ancla sale de anclaCicloPlan y no de `fechaContratacion || vencimiento`,
  // que es lo que hacían los tres callers. Ese `||` le pasaba el VENCIMIENTO
  // como si fuera la contratación, y finCicloPlan le resta el día por dentro:
  // el ciclo nacía un día corto. Y como el vencimiento nuevo se graba sin tocar
  // `fecha_contratacion`, el error se acumulaba un día por cada renovación
  // anclada, indefinidamente. anclaCicloPlan ya sabe deducir el borde real del
  // ciclo (vencimiento + 1 día) cuando no hay contratación guardada, que es el
  // caso de las ~389 filas de la carga histórica del mesón.
  let base = anclaCicloPlan(cliente) ?? new Date(hoy);
  if (isNaN(base.getTime())) base = new Date(hoy);
  // `hoy` es día-granular (mismo criterio que planStatus), así que el ciclo
  // puede caer "hoy" con una hora ya pasada en el momento exacto en que corre
  // esta función (ver sigueVigenteHoy); el segundo tope (`ahora`) es la red de
  // seguridad para que el vencimiento que se guarda nunca nazca ya vencido.
  const ahora = new Date();
  let ciclos = 1;
  let venc = finCicloPlan(base, ciclos);
  while (venc <= hoy || venc <= ahora) venc = finCicloPlan(base, ++ciclos);
  return venc.toISOString();
}

/**
 * Día en que arranca un ciclo de plan de este cliente, para anclar los ciclos
 * mensuales (ver periodoPlan). Es `fechaContratacion`; cuando no la hay —hay
 * clientes con plan vigente sin ella, de la carga histórica— se deduce del
 * `vencimiento`, que NO es el borde del ciclo sino el último día vigente: el
 * ciclo siguiente arranca al día siguiente (ver finCicloPlan). null = el
 * cliente no tiene ningún ancla, o sea no tiene plan.
 *
 * De acá sale el invariante que sostiene todo el ciclo: el vencimiento SIEMPRE
 * se calcula desde esta misma fecha (finCicloPlan/vencimientoAnclado), así que
 * la ventana de pases y el mes pagado son el mismo intervalo por construcción.
 * Por eso, cuando un cobro reinicia el ciclo desde hoy, hay que mover también
 * `fechaContratacion` — si no, el aniversario viejo parte el mes recién pagado
 * en dos ventanas y el cliente recibe 10 pasadas por un mes.
 *
 * Ojo con reusar esto para calcular vencimientos: `vencimientoAnclado` espera
 * la fecha de contratación cruda (le resta el día por dentro), así que
 * pasarle este ancla adelantaría el vencimiento un día.
 *
 * NO intentar rellenar `fechaContratacion` de las filas viejas que la tienen
 * en null (389 al 1-sep-2026, la carga histórica del mesón). Se midió dos
 * veces y las dos se descartaron:
 * - Reconstruirla desde `ventas` acierta 36% contra las 746 filas que sí
 *   tienen ancla, y aplicarla movía la ventana de pases de 214 clientes y le
 *   quitaba una pasada YA PAGADA a 5. El tipo de venta no dice si el ciclo
 *   reinició: eso se decide en runtime (`reinicia = reiniciarCiclo &&
 *   !vigente`, ver aplicarPagoAprobado), así que una reactivación cobrada a un
 *   cliente todavía vigente apila y se graba con el mismo tipo.
 * - Guardar el valor que esta función deduce es peor que el null: para un
 *   cliente vigente es una fecha FUTURA, y la columna la leen en crudo
 *   ClienteInfoModal, visitasDesdeContratacion y dos auditorías de calidad.
 * El null es seguro justamente porque esta función lo cubre. Lo que sí quedó
 * roto es de presentación: la ficha muestra "Contrató el plan: -".
 */
export function anclaCicloPlan(cliente: Pick<Cliente, "fechaContratacion" | "vencimiento">): Date | null {
  if (cliente.fechaContratacion) return diaEnSantiago(cliente.fechaContratacion);
  if (!cliente.vencimiento) return null;
  const dia = diaEnSantiago(cliente.vencimiento);
  if (dia) dia.setDate(dia.getDate() + 1);
  return dia;
}

/**
 * Período de plan vigente hoy, anclado en ciclos mensuales (mismo ciclo que
 * vencimientoAnclado). P. ej. contratado el 12 de junio, el período vigente
 * el 5 de julio es [12 jun, 12 jul): vence el 11. `fin` es exclusivo — es el
 * inicio del ciclo siguiente, no el vencimiento.
 *
 * El ancla sale de anclaCicloPlan, que cubre al cliente con plan vigente y
 * sin `fechaContratacion`: sin eso caía en la ventana móvil de abajo, que
 * cuenta el último mes corrido en vez del ciclo del plan — al cliente con
 * plan X5 le sumaba pasadas de su período anterior y el Operador le negaba el
 * ingreso incluido con "ya usó las 5" (ver pasesRestantes / estadoIngreso en
 * useOperadorFoundResult).
 *
 * Sin plan (ningún ancla) se usa una ventana del último mes.
 */
export function periodoPlan(
  cliente: Pick<Cliente, "fechaContratacion" | "vencimiento">,
  ahora: Date = ahoraEnSantiago()
): { inicio: Date; fin: Date } {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const base = anclaCicloPlan(cliente);
  if (!base) return { inicio: sumarMesesFecha(hoy, -1), fin: hoy };
  let ciclos = 0;
  while (sumarMesesFecha(base, ciclos + 1) <= hoy) ciclos++;
  // El ancla puede quedar en el futuro —`vencimiento` siempre lo está
  // mientras el plan siga vigente, y una renovación anticipada lo deja hasta
  // a dos meses—, y ahí hay que retroceder ciclos en vez de avanzarlos.
  while (sumarMesesFecha(base, ciclos) > hoy) ciclos--;
  return { inicio: sumarMesesFecha(base, ciclos), fin: sumarMesesFecha(base, ciclos + 1) };
}

/**
 * clientes.visitas/ultima_visita se escriben con un upsertClientes() separado
 * del insertIngresos() que crea la fila de Historial de Ingresos que las
 * originó (ver registrarIngreso en @/lib/logic y commit() en AppContext) —
 * dos escrituras independientes, no una transacción. Si una llega a la base
 * y la otra no (conexión intermitente, por ejemplo), el contador queda
 * desincronizado del historial real y no hay forma de que se autocorrija.
 * Para que esto no pueda pasar, se recalculan ambos campos a partir de
 * `ingresos` (la fuente de verdad) en vez de confiar en el valor guardado en
 * la columna.
 *
 * Extraído de dataAccess/loadAll.ts para poder correrlo también en el
 * cliente: `ingresos` llega en una carga separada y más lenta que `clientes`
 * (ver loadCore/loadHistorial y AppContext) — hasta que esa carga termina,
 * `data.clientes` trae visitas/ultimaVisita "tal cual están en la tabla"
 * (potencialmente desincronizadas, el mismo caso que esto corrige) y este
 * helper se vuelve a aplicar apenas `ingresos` está disponible.
 */
export function recalcularVisitasClientes(clientes: Cliente[], ingresos: Ingreso[]): Cliente[] {
  const visitasPorCliente = new Map<string, { visitas: number; ultimaVisita: string }>();
  for (const r of ingresos) {
    if (!r.clienteId) continue;
    const actual = visitasPorCliente.get(r.clienteId);
    visitasPorCliente.set(r.clienteId, {
      visitas: (actual?.visitas ?? 0) + 1,
      ultimaVisita: actual && new Date(actual.ultimaVisita) > new Date(r.fecha) ? actual.ultimaVisita : r.fecha,
    });
  }
  return clientes.map((c) => {
    const real = visitasPorCliente.get(c.id);
    return { ...c, visitas: real?.visitas ?? 0, ultimaVisita: real?.ultimaVisita ?? c.ultimaVisita };
  });
}
