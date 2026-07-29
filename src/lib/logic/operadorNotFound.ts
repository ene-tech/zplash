import { PLANES, formatRut, montoDescuento, precioLavadoUnico, precioNormal, resolverDescuento, uid } from "@/lib/helpers";
import { registrarIngreso } from "./ingresos";
import type { AppData, Cliente, Cupon, Empresa, Ingreso, PagoInfo, Venta } from "@/types";

export interface DatosClienteRapido {
  patente: string;
  nombre: string;
  telefono: string;
  email: string;
  vehiculo: string;
  tipoDocumento: "Boleta" | "Factura";
  razonSocial: string;
  rut: string;
  direccion: string;
  giro: string;
  tipoCliente: "plan" | "unico";
  codigoCupon: string;
  perfilNombre: string | undefined;
}

export type PreparadoClienteRapido =
  | { ok: false; error: string }
  | {
      ok: true;
      nuevo: Cliente;
      precio: number;
      cuponAplicado?: Cupon;
      tipoVenta: string;
      descripcion: string;
      nuevaEmpresa?: Empresa;
    };

/**
 * Primera mitad del registro rápido de "patente no registrada" (ver
 * validarQuickAddCliente en @/components/operador): arma el Cliente nuevo, el
 * precio a cobrar (con cupón si corresponde) y la Empresa si es Factura con
 * un RUT nuevo. Se separa de finalizarClienteRapido porque el medio de pago
 * (PagoInfo) recién se conoce después de que el operador lo confirma en el
 * modal de pago — precio/descripcion de acá son justo lo que ese modal
 * necesita para abrirse.
 */
export function prepararClienteRapido(data: AppData, d: DatosClienteRapido): PreparadoClienteRapido {
  const plan = PLANES[0];
  let vencimiento: string | null = null;
  if (d.tipoCliente === "plan") {
    const venc = new Date();
    venc.setDate(venc.getDate() + 30);
    vencimiento = venc.toISOString();
  }
  const nuevo: Cliente = {
    id: uid(),
    nombre: d.nombre,
    telefono: d.telefono,
    email: d.email,
    vehiculo: d.vehiculo,
    patente: d.patente,
    plan: d.tipoCliente === "plan" ? plan : "",
    tipoDocumento: d.tipoDocumento,
    razonSocial: d.razonSocial,
    rut: d.rut,
    direccion: d.direccion,
    giro: d.giro,
    vencimiento,
    origen: "LOCAL",
    visitas: 0,
    creadoEn: new Date().toISOString(),
    creadoPor: d.perfilNombre || "",
  };

  const precioBase = d.tipoCliente === "plan" ? precioNormal(data.precios, plan) : precioLavadoUnico(data.precios);
  let precio = precioBase;
  let cuponAplicado: Cupon | undefined;
  if (d.tipoCliente === "unico" && d.codigoCupon) {
    const resultado = resolverDescuento(d.codigoCupon, nuevo.patente, data.cupones);
    if (!resultado.ok) return { ok: false, error: resultado.msg };
    cuponAplicado = resultado.cupon;
    precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
  }
  const tipoVenta = d.tipoCliente === "plan" ? "Plan nuevo" : "Lavado único";
  const descripcion = d.tipoCliente === "plan" ? `Contratación de plan para ${d.nombre}` : `Lavado único para ${d.nombre}`;

  // Si es Factura y el RUT no pertenece a ninguna empresa ya registrada, se
  // crea una nueva en Empresas con este cliente como persona de contacto.
  let nuevaEmpresa: Empresa | undefined;
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
      creadoPor: d.perfilNombre || "",
    };
  }

  return { ok: true, nuevo, precio, cuponAplicado, tipoVenta, descripcion, nuevaEmpresa };
}

/**
 * Segunda mitad: una vez confirmado el pago, deja la Venta y el Ingreso (vía
 * registrarIngreso, mismo helper que usa el resto del módulo Operador) y
 * marca el cupón como usado si se aplicó uno.
 */
export function finalizarClienteRapido(
  data: AppData,
  preparado: Extract<PreparadoClienteRapido, { ok: true }>,
  pago: PagoInfo,
  perfilNombre: string | undefined
): Partial<AppData> {
  const { nuevo, precio, cuponAplicado, tipoVenta, nuevaEmpresa } = preparado;
  const ahora = new Date().toISOString();
  const venta: Venta = {
    id: "v" + Date.now(),
    clienteId: nuevo.id,
    patente: nuevo.patente,
    nombre: nuevo.nombre,
    plan: nuevo.plan || "",
    precio,
    tipo: tipoVenta,
    fecha: ahora,
    creadoPor: perfilNombre || "",
    metodoPago: pago.metodo,
    voucher: pago.voucher,
    viaCupon: !!cuponAplicado,
    cuponCodigo: cuponAplicado?.codigo,
  };
  const tempData = { ...data, clientes: [...data.clientes, nuevo], ventas: [venta, ...data.ventas] };
  const ingresoPatch = registrarIngreso(tempData, nuevo, perfilNombre);
  return {
    clientes: ingresoPatch.clientes,
    ventas: tempData.ventas,
    ingresos: ingresoPatch.ingresos,
    ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    ...(cuponAplicado
      ? {
          cupones: data.cupones.map((x) =>
            x.id === cuponAplicado.id
              ? { ...cuponAplicado, usado: true, patenteUso: nuevo.patente, fechaUso: ahora, operadorUso: perfilNombre || "" }
              : x
          ),
        }
      : {}),
  };
}

/**
 * Ingreso "sin registro": no queda de verdad sin registro, se crea una ficha
 * de Cliente identificada como "Invitado" para esa patente (ver comentario en
 * el llamador, useOperadorNotFoundResult), así el próximo ingreso la
 * encuentra por findClient() y queda historial de visitas/frecuencia de ese
 * vehículo aunque nunca haya dado sus datos.
 */
export function registrarIngresoInvitado(
  data: AppData,
  d: { patente: string; precio: number; pago: PagoInfo; perfilNombre: string | undefined }
): Partial<AppData> {
  const ahora = new Date().toISOString();
  const invitado: Cliente = {
    id: uid(),
    nombre: "Invitado",
    patente: d.patente,
    plan: "",
    vencimiento: null,
    origen: "LOCAL",
    visitas: 1,
    ultimaVisita: ahora,
    creadoEn: ahora,
    creadoPor: d.perfilNombre || "",
  };
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: invitado.id,
    patente: d.patente,
    nombre: invitado.nombre,
    fecha: ahora,
    planEstadoAlIngreso: "bad",
    creadoPor: d.perfilNombre || "",
  };
  const venta: Venta = {
    id: "v" + Date.now(),
    clienteId: invitado.id,
    patente: d.patente,
    nombre: invitado.nombre,
    plan: "",
    precio: d.precio,
    tipo: "Lavado único",
    fecha: ahora,
    creadoPor: d.perfilNombre || "",
    metodoPago: d.pago.metodo,
    voucher: d.pago.voucher,
  };
  return {
    clientes: [...data.clientes, invitado],
    ingresos: [ingreso, ...data.ingresos],
    ventas: [venta, ...data.ventas],
  };
}
