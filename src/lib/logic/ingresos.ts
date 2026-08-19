import type { AppData, Cita, Cliente, Cupon, Ingreso, PagoInfo, Venta } from "@/types";
import { esRetrocesoInvalido } from "@/lib/agenda";
import {
  GLOSA_LAVADO_WEB,
  GLOSA_SERVICIO_DETAILING,
  MAX_INGRESOS_TUNEL_DETAILING_POR_CITA,
  enPlazoDePagoPlan,
  planAlRenovar,
  planStatus,
  sigueVigenteHoy,
  ventaLavadoUnicoDeIngreso,
  visitasPeriodoPlan,
} from "@/lib/helpers";

export function registrarIngreso(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null | undefined,
  esGarantia?: boolean
): Partial<AppData> {
  const estadoPlan = planStatus(cliente).cls;
  const fecha = new Date().toISOString();
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha,
    planEstadoAlIngreso: estadoPlan,
    creadoPor: operadorActual || "",
    esGarantia: esGarantia || undefined,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: fecha,
  };
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
  };
}

// Registra el canje de un cupón "vale" en el módulo Operador: marca el cupón
// como usado y deja el Ingreso ligado a la ficha del cliente, igual que
// cualquier otro paso por el túnel. Ese vínculo es el punto: hasta antes de
// esto el canje guardaba un Ingreso anónimo (clienteId "", nombre = el lote),
// así que del auto que entró gratis no quedaba ni nombre ni teléfono ni
// correo — ver el respaldo por patente que tuvo que agregarse en
// DetalleIngresosTabla. Quien llama se asegura de que el cliente exista
// (creándolo antes si la patente no estaba registrada) y de que venga dentro
// de `data.clientes`, igual que finalizarClienteRapido con su cliente nuevo.
// No genera Venta: el lote ya se cobró completo al generarse.
export function registrarIngresoCupon(
  data: AppData,
  cliente: Cliente,
  cupon: Cupon,
  operadorActual: string | null | undefined
): Partial<AppData> {
  const ahora = new Date().toISOString();
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: ahora,
    planEstadoAlIngreso: planStatus(cliente).cls,
    creadoPor: operadorActual || "",
    viaCupon: true,
    cuponCodigo: cupon.codigo,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: ahora,
  };
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    cupones: data.cupones.map((c) =>
      c.id === cupon.id
        ? { ...cupon, usado: true, patenteUso: cliente.patente, fechaUso: ahora, operadorUso: operadorActual || "" }
        : c
    ),
  };
}

// Registra el paso físico por el túnel de un lavado completo/detailing ya
// vendido en Servicios Adicionales (Venta + Cita creadas ahí, ver registrar()
// en ServiciosAdicionalesView.tsx): a diferencia de registrarIngreso(), esto
// NO genera una Venta nueva — la venta ya existe — solo deja constancia en
// Historial de Ingresos (glosa "Servicio de Detailing") y avanza el circuito de
// la cita a "en_limpieza".
export function registrarIngresoDetailing(
  data: AppData,
  cliente: Cliente,
  cita: Cita,
  operadorActual: string | null | undefined
): Partial<AppData> {
  // La cita puede pasar hasta MAX_INGRESOS_TUNEL_DETAILING_POR_CITA veces por
  // el túnel (p. ej. un segundo enjuague tras lavado de motor/chasis) sin que
  // eso duplique la venta. Una vez alcanzado el máximo, si el operador vuelve
  // a escanear la misma patente (la cita se sigue ofreciendo como
  // "pendiente" mientras esté en recibido/en_limpieza/listo_entrega, ver
  // puedeIngresarTunelDetailing) no hay que seguir sumando Ingresos ni visitas.
  const pasadasRegistradas = data.ingresos.filter((i) => i.citaId === cita.id).length;
  if (pasadasRegistradas >= MAX_INGRESOS_TUNEL_DETAILING_POR_CITA) {
    return {};
  }
  const ahora = new Date().toISOString();
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: ahora,
    planEstadoAlIngreso: planStatus(cliente).cls,
    creadoPor: operadorActual || "",
    glosa: GLOSA_SERVICIO_DETAILING,
    citaId: cita.id,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: ahora,
  };
  // No retroceder el estado de la cita (p. ej. si Servicios Adicionales ya la
  // avanzó a "listo_entrega" antes de que el operador alcanzara a registrar
  // el ingreso al túnel) — mismo criterio que ya se aplica en los selects de
  // Agenda/Servicios Adicionales, ver esRetrocesoInvalido.
  const nuevoEstadoCita = esRetrocesoInvalido(cita.estado, "en_limpieza") ? cita.estado : "en_limpieza";
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    citas: data.citas.map((ct) => (ct.id === cita.id ? { ...ct, estado: nuevoEstadoCita } : ct)),
  };
}

// Registra el paso físico por el túnel de un "Lavado único" ya pagado
// online desde /pagar (ver ventaLavadoWebPendiente en lib/helpers): a
// diferencia de registrarIngreso(), esto NO genera una Venta nueva — ya
// existe, se cobró vía Webpay — solo deja constancia en Historial de
// Ingresos (glosa GLOSA_LAVADO_WEB) y marca esa venta como canjeada para que
// no se pueda volver a usar en una segunda pasada.
export function registrarIngresoLavadoWeb(
  data: AppData,
  cliente: Cliente,
  venta: Venta,
  operadorActual: string | null | undefined
): Partial<AppData> {
  const ahora = new Date().toISOString();
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: ahora,
    planEstadoAlIngreso: planStatus(cliente).cls,
    creadoPor: operadorActual || "",
    glosa: GLOSA_LAVADO_WEB,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: ahora,
  };
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    ventas: data.ventas.map((v) => (v.id === venta.id ? { ...v, canjeadaEn: ahora } : v)),
  };
}

// Reversa el registro de un Ingreso hecho por error (gerencia, ver
// puedeBorrarIngreso en @/lib/helpers): además de la fila de ingresos, esto
// deshace el conteo de visitas y recalcula ultimaVisita a partir de los
// ingresos que queden para ese cliente (no del ingreso borrado), para que
// quede igual de correcto sin importar si el ingreso borrado era o no el más
// reciente. Si el ingreso es de un "lavado único" cobrado (ver
// cobrarLavadoUnico en useIngresoActions), también borra la Venta pareja
// (ver ventaLavadoUnicoDeIngreso): si no, el cliente sigue apareciendo
// elegible para la promoción de upgrade a plan (ventaUpgradeElegible) por un
// lavado que, en teoría, nunca ocurrió. No toca el cupón usado en esa venta
// ni el estado de la Cita de un check-in de Detailing — esas reversiones, si
// hacen falta, se hacen aparte.
export function eliminarIngreso(data: AppData, ingreso: Ingreso): Partial<AppData> {
  const ingresosRestantes = data.ingresos.filter((i) => i.id !== ingreso.id);
  const ventaPareja = ventaLavadoUnicoDeIngreso(data.ventas, ingreso);
  const patchVentas: Partial<AppData> = ventaPareja ? { ventas: data.ventas.filter((v) => v.id !== ventaPareja.id) } : {};
  const cliente = data.clientes.find((c) => c.id === ingreso.clienteId);
  if (!cliente) return { ingresos: ingresosRestantes, ...patchVentas };
  const ingresosCliente = ingresosRestantes.filter((i) => i.clienteId === cliente.id);
  const ultimaVisita = ingresosCliente.length
    ? ingresosCliente.reduce((max, i) => (i.fecha > max ? i.fecha : max), ingresosCliente[0].fecha)
    : undefined;
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: Math.max(0, (cliente.visitas || 0) - 1),
    ultimaVisita,
  };
  return {
    ingresos: ingresosRestantes,
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    ...patchVentas,
  };
}

export function renovarPlan(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null | undefined,
  precio: number,
  pago?: PagoInfo,
  tipo: string = "Renovación preferencial",
  /**
   * true solo en el pago de un plan atrasado (ver pagarAtrasado en
   * usePlanActions): ahí un vencimiento ya pasado, pero dentro de los días de
   * gracia, igual ancla el ciclo — el cliente pagó tarde y conserva su fecha.
   * Las demás renovaciones del mesón NO lo piden a propósito: la reactivación
   * promocional de un vencido es una oferta para recuperarlo y le da su mes
   * completo desde hoy, así que anclarla le estaría recortando en silencio
   * tantos días como llevara vencido.
   */
  anclarAtraso = false
): Partial<AppData> {
  // El nuevo ciclo se ancla al vencimiento que ya tenía siempre que el plan
  // siga vigente hoy (renovar antes no le hace perder los días que le
  // quedaban; día-granular vía sigueVigenteHoy, para que renovar el mismo día
  // del vencimiento con la hora ya pasada tampoco los pierda), y además en el
  // pago atrasado dentro del plazo de gracia (ver anclarAtraso). Si no, el
  // ciclo parte de hoy.
  const anclarAlVencimiento =
    !!cliente.vencimiento &&
    (sigueVigenteHoy(cliente.vencimiento) ||
      (anclarAtraso && enPlazoDePagoPlan(cliente, data.config.diasGraciaPagoAtrasado)));
  const base = anclarAlVencimiento ? new Date(cliente.vencimiento!) : new Date();
  // Con un plazo de gracia largo, el vencimiento anclado podría nacer ya
  // vencido (misma red de seguridad que vencimientoAnclado): en ese caso se
  // suma otro ciclo hasta que quede en el futuro.
  do {
    base.setDate(base.getDate() + 30);
  } while (base <= new Date());
  // La renovación es el momento en que un cliente del plan ilimitado viejo
  // pasa al X5, y solo si viene lavando seguido (ver planAlRenovar): al que
  // pasa 5 veces o menos no le cambia nada — el tope no lo afecta, así que no
  // hay por qué tocarle el plan ni avisarle nada a mitad de su ciclo de pago.
  const plan = planAlRenovar(cliente.plan, visitasPeriodoPlan(data.ingresos, cliente));
  const clienteActualizado: Cliente = {
    ...cliente,
    plan,
    vencimiento: base.toISOString(),
    ultimaRenovacion: new Date().toISOString(),
  };
  const venta: Venta = {
    id: "v" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    plan,
    precio,
    tipo,
    fecha: new Date().toISOString(),
    creadoPor: operadorActual || "",
    metodoPago: pago?.metodo,
    voucher: pago?.voucher,
  };
  return {
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    ventas: [venta, ...data.ventas],
  };
}
