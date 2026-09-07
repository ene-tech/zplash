import {
  PLANES,
  PROMO_2_LAVADOS_KEY,
  formatRut,
  marcarDescuentoUsado,
  montoDescuento,
  precioContratacion,
  precioLavadoUnico,
  precioPromo2Lavados,
  resolverDescuento,
  uid,
  cicloPlanDesde,
} from "@/lib/helpers";
import { entregarPromo2Lavados, registrarIngreso } from "./ingresos";
import type { AppData, Cliente, Cupon, Empresa, PagoInfo, Venta } from "@/types";

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
  // "promo2" = Promo 2 Lavados (ver PROMO_2_LAVADOS_KEY): se cobra como un
  // lavado suelto (sin plan ni ciclo) y deja 2 tickets para la patente.
  tipoCliente: "plan" | "unico" | "promo2";
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
  // Contratar acá siempre arranca un ciclo nuevo: vencimiento y contratación
  // van juntos (ver cicloPlanDesde), si no la ventana de pases del X5 se
  // deduce del vencimiento y puede caer corrida un mes.
  const ciclo = d.tipoCliente === "plan" ? cicloPlanDesde() : null;
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
    vencimiento: ciclo?.vencimiento ?? null,
    fechaContratacion: ciclo?.fechaContratacion ?? null,
    origen: "LOCAL",
    visitas: 0,
    creadoEn: new Date().toISOString(),
    creadoPor: d.perfilNombre || "",
  };

  // Patente no registrada: si contrata plan es siempre una 1ra contratación
  // (ver precioContratacion), por eso va sin cliente.
  const precioBase =
    d.tipoCliente === "plan"
      ? precioContratacion(data.precios, plan)
      : d.tipoCliente === "promo2"
        ? precioPromo2Lavados(data.precios)
        : precioLavadoUnico(data.precios);
  let precio = precioBase;
  let cuponAplicado: Cupon | undefined;
  if (d.tipoCliente === "unico" && d.codigoCupon) {
    const resultado = resolverDescuento(d.codigoCupon, nuevo.patente, data.cupones, data.clientes);
    if (!resultado.ok) return { ok: false, error: resultado.msg };
    cuponAplicado = resultado.cupon;
    precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
  }
  const tipoVenta = d.tipoCliente === "plan" ? "Plan nuevo" : d.tipoCliente === "promo2" ? PROMO_2_LAVADOS_KEY : "Lavado único";
  const descripcion =
    d.tipoCliente === "plan"
      ? `Contratación de plan para ${d.nombre}`
      : d.tipoCliente === "promo2"
        ? `Promo 2 lavados para ${d.nombre}`
        : `Lavado único para ${d.nombre}`;

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
 * Segunda mitad: una vez confirmado el pago, deja la Venta y marca el cupón
 * como usado si se aplicó uno. El Ingreso (vía registrarIngreso, mismo helper
 * que usa el resto del módulo Operador) solo se registra si la venta es un
 * Lavado único: eso sí implica que el vehículo pasa por el túnel ahora mismo.
 * Un plan nuevo es solo una venta — igual que contratarPlan() en el flujo de
 * cliente encontrado (ver usePlanActions) — no corresponde marcarle una
 * visita ni un paso por el túnel que todavía no ocurrió.
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
  const clientesConNuevo = [...data.clientes, nuevo];
  const ventasConNueva = [venta, ...data.ventas];
  // La Promo 2 Lavados también es un paso físico: se entrega con el primero
  // de sus 2 tickets ya canjeado (ver entregarPromo2Lavados).
  const datosConNuevo = { ...data, clientes: clientesConNuevo, ventas: ventasConNueva };
  const ingresoPatch: Partial<AppData> =
    tipoVenta === "Lavado único"
      ? registrarIngreso(datosConNuevo, nuevo, perfilNombre)
      : tipoVenta === PROMO_2_LAVADOS_KEY
        ? entregarPromo2Lavados(datosConNuevo, nuevo, precio, perfilNombre)
        : {};
  return {
    clientes: ingresoPatch.clientes ?? clientesConNuevo,
    ventas: ventasConNueva,
    ...(ingresoPatch.ingresos ? { ingresos: ingresoPatch.ingresos } : {}),
    ...(ingresoPatch.cupones ? { cupones: ingresoPatch.cupones } : {}),
    ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    ...(cuponAplicado
      ? {
          cupones: data.cupones.map((x) =>
            x.id === cuponAplicado.id ? marcarDescuentoUsado(cuponAplicado, nuevo.patente, perfilNombre, ahora) : x
          ),
        }
      : {}),
  };
}
