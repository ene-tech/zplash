import {
  PLANES,
  IDS_PROMOS_LAVADOS,
  PROMOS_LAVADOS,
  formatRut,
  marcarDescuentoUsado,
  montoDescuento,
  precioContratacion,
  precioLavadoUnico,
  precioPromoLavados,
  resolverDescuento,
  uid,
  cicloPlanDesde,
  type IdPromoLavados,
} from "@/lib/helpers";
import { entregarPromoLavados, registrarIngreso } from "./ingresos";
import type { AppData, Cliente, Cupon, Empresa, PagoInfo, Venta } from "@/types";

export type TipoClienteRapido = "plan" | "unico" | "promo2" | "promo5";
const PROMO_DE_TIPO: Partial<Record<TipoClienteRapido, IdPromoLavados>> = {
  promo2: "promo_2_lavados",
  promo5: "promo_5_lavados",
};

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
  // "promo2"/"promo5" = Promo 2/5 Lavados (ver PROMOS_LAVADOS): se cobra
  // como un lavado suelto (sin plan ni ciclo) y deja los tickets para la patente.
  tipoCliente: TipoClienteRapido;
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
  const promo = PROMO_DE_TIPO[d.tipoCliente];
  const precioBase =
    d.tipoCliente === "plan"
      ? precioContratacion(data.precios, plan)
      : promo
        ? precioPromoLavados(data.precios, promo)
        : precioLavadoUnico(data.precios);
  let precio = precioBase;
  let cuponAplicado: Cupon | undefined;
  if (d.tipoCliente === "unico" && d.codigoCupon) {
    const resultado = resolverDescuento(d.codigoCupon, nuevo.patente, data.cupones, data.clientes);
    if (!resultado.ok) return { ok: false, error: resultado.msg };
    cuponAplicado = resultado.cupon;
    precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
  }
  const tipoVenta = d.tipoCliente === "plan" ? "Plan nuevo" : promo ? PROMOS_LAVADOS[promo].key : "Lavado único";
  const descripcion =
    d.tipoCliente === "plan"
      ? `Contratación de plan para ${d.nombre}`
      : promo
        ? `Promo ${PROMOS_LAVADOS[promo].lavados} lavados para ${d.nombre}`
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
  // Un pack de lavados también es un paso físico: se entrega con el primero
  // de sus tickets ya canjeado (ver entregarPromoLavados).
  const datosConNuevo = { ...data, clientes: clientesConNuevo, ventas: ventasConNueva };
  const promo = IDS_PROMOS_LAVADOS.find((id) => PROMOS_LAVADOS[id].key === tipoVenta);
  const ingresoPatch: Partial<AppData> =
    tipoVenta === "Lavado único"
      ? registrarIngreso(datosConNuevo, nuevo, perfilNombre)
      : promo
        ? entregarPromoLavados(datosConNuevo, nuevo, precio, perfilNombre, promo)
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
