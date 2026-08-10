import type { AppData, Cita, Cliente, Ingreso, PagoInfo, Venta } from "@/types";
import { esRetrocesoInvalido } from "@/lib/agenda";
import {
  GLOSA_LAVADO_WEB,
  GLOSA_SERVICIO_DETAILING,
  MAX_INGRESOS_TUNEL_DETAILING_POR_CITA,
  planStatus,
  ventaLavadoUnicoDeIngreso,
} from "@/lib/helpers";

export function registrarIngreso(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null | undefined,
  esGarantia?: boolean,
  glosa?: string
): Partial<AppData> {
  const estadoPlan = planStatus(cliente).cls;
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: new Date().toISOString(),
    planEstadoAlIngreso: estadoPlan,
    creadoPor: operadorActual || "",
    esGarantia: esGarantia || undefined,
    glosa: glosa || undefined,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: new Date().toISOString(),
  };
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
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
  tipo: string = "Renovación preferencial"
): Partial<AppData> {
  const base = cliente.vencimiento && new Date(cliente.vencimiento) > new Date() ? new Date(cliente.vencimiento) : new Date();
  base.setDate(base.getDate() + 30);
  const clienteActualizado: Cliente = {
    ...cliente,
    vencimiento: base.toISOString(),
    ultimaRenovacion: new Date().toISOString(),
  };
  const venta: Venta = {
    id: "v" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    plan: cliente.plan || "",
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
