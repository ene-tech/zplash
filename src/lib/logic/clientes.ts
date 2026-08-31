import { formatRut, planStatus, precioContratacion, precioLavadoUnico, uid } from "@/lib/helpers";
import type { AppData, Cliente, Empresa, Ingreso, PagoInfo, Venta } from "@/types";

export interface DatosClienteModal {
  clienteExistente: Cliente | null;
  contexto: "operador" | "admin" | undefined;
  perfilNombre: string | undefined;
  nombre: string;
  patente: string;
  telefono: string;
  email: string;
  vehiculo: string;
  tipoDocumento: "Boleta" | "Factura";
  razonSocial: string;
  rut: string;
  direccion: string;
  giro: string;
  plan: string;
  vencimiento: string | null;
  /** Ancla del ciclo de pases cuando este guardado arranca un plan nuevo (ver
   * cicloPlanDesde en @/lib/helpers). undefined = no se toca: es una edición
   * de ficha, o un vencimiento tipeado a mano desde el admin. */
  fechaContratacion?: string;
  origen: "WEB" | "LOCAL";
  /** Precio de plan que se le respeta al renovar a tiempo (ver
   * precioConHeredado en @/lib/helpers) — null = paga el precio vigente.
   * Solo lo manda la ficha de admin, que es la única que muestra el campo:
   * ausente (undefined) el cliente conserva el que ya tenía, para que
   * guardar la ficha desde el operador no le borre en silencio el precio que
   * se le venía respetando en cada renovación. */
  precioPlanHeredado?: number | null;
  pago?: PagoInfo;
}

/**
 * Guarda el alta/edición de cliente ya validado (ver validarClienteModal en
 * @/components/modals): da de alta o actualiza el Cliente, crea la Empresa si
 * corresponde (Factura con un RUT nuevo), y — solo en un alta nueva desde el
 * punto de venta del operador — deja además la Venta e Ingreso
 * correspondientes (el alta ya implica que el vehículo entró físicamente, ver
 * comentario en `visitas` más abajo). Editar un cliente existente, o dar de
 * alta uno desde el admin, nunca genera Venta/Ingreso ni cobra: es un cambio
 * de ficha, no un movimiento de caja.
 */
export function guardarClienteModal(data: AppData, d: DatosClienteModal): Partial<AppData> {
  let clientes: Cliente[];
  let ventas = data.ventas;
  let ingresos = data.ingresos;
  let nuevaEmpresa: Empresa | undefined;

  if (d.clienteExistente) {
    const actualizado: Cliente = {
      ...d.clienteExistente,
      nombre: d.nombre,
      patente: d.patente,
      telefono: d.telefono,
      email: d.email,
      vehiculo: d.vehiculo,
      plan: d.plan,
      tipoDocumento: d.tipoDocumento,
      razonSocial: d.razonSocial,
      rut: d.rut,
      direccion: d.direccion,
      giro: d.giro,
      vencimiento: d.vencimiento,
      ...(d.fechaContratacion ? { fechaContratacion: d.fechaContratacion } : {}),
      origen: d.origen,
      ...(d.precioPlanHeredado !== undefined ? { precioPlanHeredado: d.precioPlanHeredado } : {}),
    };
    clientes = data.clientes.map((x) => (x.id === actualizado.id ? actualizado : x));
    if (d.tipoDocumento === "Factura" && d.rut && !data.empresas.some((e) => formatRut(e.rut) === d.rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial: d.razonSocial,
        rut: d.rut,
        giro: d.giro,
        direccion: d.direccion,
        telefono: d.telefono,
        contactoClienteId: actualizado.id,
        contactoNombre: actualizado.nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: d.perfilNombre || (d.contexto === "operador" ? "" : "Administrador"),
      };
    }
    return {
      clientes,
      ventas,
      ingresos,
      ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    };
  }

  const nuevo: Cliente = {
    id: "c" + Date.now() + Math.floor(Math.random() * 1000),
    nombre: d.nombre,
    patente: d.patente,
    telefono: d.telefono,
    email: d.email,
    vehiculo: d.vehiculo,
    plan: d.plan,
    tipoDocumento: d.tipoDocumento,
    razonSocial: d.razonSocial,
    rut: d.rut,
    direccion: d.direccion,
    giro: d.giro,
    vencimiento: d.vencimiento,
    fechaContratacion: d.fechaContratacion ?? null,
    origen: d.origen,
    precioPlanHeredado: d.precioPlanHeredado ?? null,
    // El alta desde el punto de venta del operador ("+ Agregar vehículo
    // nuevo") es el vehículo entrando físicamente en ese momento, así que ya
    // cuenta como su primera visita (ver Ingreso más abajo). Un alta desde el
    // admin (ClientesTab) no implica que el cliente haya pasado por el local.
    visitas: d.contexto === "operador" ? 1 : 0,
    ultimaVisita: d.contexto === "operador" ? new Date().toISOString() : undefined,
    creadoEn: new Date().toISOString(),
    creadoPor: d.contexto === "operador" ? d.perfilNombre || "" : "Administrador",
  };
  clientes = [...data.clientes, nuevo];

  if (d.tipoDocumento === "Factura" && d.rut && !data.empresas.some((e) => formatRut(e.rut) === d.rut)) {
    nuevaEmpresa = {
      id: uid(),
      razonSocial: d.razonSocial,
      rut: d.rut,
      giro: d.giro,
      direccion: d.direccion,
      telefono: d.telefono,
      contactoClienteId: nuevo.id,
      contactoNombre: nuevo.nombre,
      creadoEn: new Date().toISOString(),
      creadoPor: d.perfilNombre || (d.contexto === "operador" ? "" : "Administrador"),
    };
  }

  if (d.vencimiento && d.contexto === "operador") {
    const venta: Venta = {
      id: "v" + Date.now(),
      clienteId: nuevo.id,
      patente: nuevo.patente,
      nombre: nuevo.nombre,
      plan: nuevo.plan || "",
      // Solo llega acá un alta nueva (la edición retorna más arriba), así que
      // es siempre una 1ra contratación — ver precioContratacion.
      precio: precioContratacion(data.precios, d.plan),
      tipo: "Plan nuevo",
      fecha: new Date().toISOString(),
      creadoPor: d.perfilNombre || "",
      metodoPago: d.pago?.metodo,
      voucher: d.pago?.voucher,
    };
    ventas = [venta, ...ventas];
  } else if (!d.vencimiento && d.contexto === "operador") {
    // Tipo "unico" (sin plan): igual se cobra un lavado único.
    const venta: Venta = {
      id: "v" + Date.now(),
      clienteId: nuevo.id,
      patente: nuevo.patente,
      nombre: nuevo.nombre,
      plan: "",
      precio: precioLavadoUnico(data.precios),
      tipo: "Lavado único",
      fecha: new Date().toISOString(),
      creadoPor: d.perfilNombre || "",
      metodoPago: d.pago?.metodo,
      voucher: d.pago?.voucher,
    };
    ventas = [venta, ...ventas];
  }

  if (d.contexto === "operador") {
    // Sin esto, el cliente y la venta quedaban registrados (aparecía cobrado
    // en Cierre de Caja) pero el vehículo nunca quedaba constancia de haber
    // entrado al túnel: Historial de Ingresos no mostraba nada para esta alta.
    const ingreso: Ingreso = {
      id: "i" + Date.now(),
      clienteId: nuevo.id,
      patente: nuevo.patente,
      nombre: nuevo.nombre,
      fecha: new Date().toISOString(),
      planEstadoAlIngreso: planStatus(nuevo).cls,
      creadoPor: d.perfilNombre || "",
    };
    ingresos = [ingreso, ...ingresos];
  }

  return {
    clientes,
    ventas,
    ingresos,
    ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
  };
}
