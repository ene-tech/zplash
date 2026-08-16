import "server-only";

import { listarReglasCorreoActivas, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { esTarjetaWeb, LAVADO_UNICO_KEY, uid } from "@/lib/helpers";
import { buscarCliente, construirVariables, ejecutarAccionReglaCorreo } from "./motor";
import type { ReglaCorreo, Venta } from "@/types";

function coincideVenta(regla: ReglaCorreo, venta: Venta): boolean {
  // "venta_creada_presencial": mismo matching que "venta_creada", pero
  // excluye ventas automáticas/web (Webpay, Oneclick, WooCommerce) — ver
  // esTarjetaWeb, que arranca de Venta.creadoPor ("Automático (...)" siempre
  // para esas, nunca para lo que tipea un operador).
  if (regla.tipoEvento === "venta_creada_presencial" && esTarjetaWeb(venta.creadoPor)) return false;
  if (regla.condicionTipoVenta && regla.condicionTipoVenta !== venta.tipo) return false;
  if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(venta.plan)) return false;
  return true;
}

async function dispararPorVenta(regla: ReglaCorreo, venta: Venta): Promise<void> {
  if (regla.delayDias > 0) return; // v1: sin cron de pendientes con delay, solo envío inmediato (delayDias=0)

  const cliente = await buscarCliente(venta.clienteId!);
  if (!cliente) return;

  // Precio de upgrade a plan (ver calcularOfertasPlanDeCliente/oferta.upgrade)
  // — solo se calcula para "Lavado único", mismo criterio que usa el Operador
  // para ofrecerlo en el momento (ventana ConfigGlobal.horasVentanaUpgradePlan,
  // cliente sin plan vigente). Si la regla apunta específicamente a "Lavado
  // único" (o sea, es justamente la de invitar al upgrade) y ahora mismo no
  // hay upgrade elegible, se salta: no tiene sentido invitar a una promo que
  // no aplica, y acá no hay reintento futuro como en plan_vencido — una venta
  // solo dispara una vez.
  let precioUpgrade: number | undefined;
  if (venta.tipo === LAVADO_UNICO_KEY) {
    precioUpgrade = (await calcularOfertasPlanDeCliente(cliente)).upgrade?.precio;
    if (regla.condicionTipoVenta === LAVADO_UNICO_KEY && precioUpgrade === undefined) return;
  }

  // El insert falla en silencio (retorna null) si esta venta ya disparó esta
  // regla antes (constraint único regla+origen) — mismo motivo que
  // dispararPorVenta de WhatsApp: insertVentas puede en teoría llamar esto
  // más de una vez para el mismo lote si el caller reintenta tras un error
  // parcial.
  const disparo = await registrarDisparoReglaCorreo({
    id: uid(),
    reglaId: regla.id,
    origenTipo: "venta",
    origenId: venta.id,
    clienteId: venta.clienteId,
    patente: venta.patente,
    estado: "programado",
    enviarEn: new Date().toISOString(),
  });
  if (!disparo) return;

  const variables = construirVariables({ cliente, monto: venta.precio, precioUpgrade });
  await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables);
}

// Se llama desde dataAccess/ventas.ts::insertVentas junto a
// evaluarReglasPorVenta (WhatsApp) — mismo choke point único de ventas
// nuevas (operador, Webpay, Oneclick, B2B), fire-and-forget: un error acá
// nunca debe tumbar la venta que lo originó.
export async function evaluarReglasCorreoPorVenta(ventasNuevas: Venta[]): Promise<void> {
  if (!ventasNuevas.length) return;
  let reglas: ReglaCorreo[];
  try {
    const [generales, presenciales] = await Promise.all([
      listarReglasCorreoActivas("venta_creada"),
      listarReglasCorreoActivas("venta_creada_presencial"),
    ]);
    reglas = [...generales, ...presenciales];
  } catch (error) {
    console.error("Error cargando reglas de correo (venta_creada)", error);
    return;
  }
  if (!reglas.length) return;

  for (const venta of ventasNuevas) {
    if (!venta.clienteId) continue; // ventas sin cliente (ej. B2B directo) no tienen a quién escribirle
    for (const regla of reglas.filter((r) => coincideVenta(r, venta))) {
      await dispararPorVenta(regla, venta).catch((error) =>
        console.error(`Error disparando regla de correo "${regla.nombre}" para venta ${venta.id}`, error)
      );
    }
  }
}

// Se llama desde cobrarSuscripcion (@/lib/pagos) cuando un cobro Oneclick
// queda "rechazada", junto a evaluarReglasPorCobroFallido (WhatsApp) —
// fire-and-forget, mismo patrón que evaluarReglasCorreoPorVenta.
export async function evaluarReglasCorreoPorCobroFallido(opts: {
  clienteId: string;
  patente: string;
  buyOrderId: string;
  monto: number;
}): Promise<void> {
  let reglas: ReglaCorreo[];
  try {
    reglas = await listarReglasCorreoActivas("cobro_fallido");
  } catch (error) {
    console.error("Error cargando reglas de correo (cobro_fallido)", error);
    return;
  }
  if (!reglas.length) return;

  const cliente = await buscarCliente(opts.clienteId);
  if (!cliente) return;

  for (const regla of reglas) {
    if (regla.condicionPlanes?.length && (!cliente.plan || !regla.condicionPlanes.includes(cliente.plan))) continue;
    const disparo = await registrarDisparoReglaCorreo({
      id: uid(),
      reglaId: regla.id,
      origenTipo: "cobro",
      origenId: opts.buyOrderId,
      clienteId: cliente.id,
      patente: opts.patente,
      estado: "programado",
      enviarEn: new Date().toISOString(),
    });
    if (!disparo) continue; // ya se disparó esta regla para este intento de cobro

    const variables = construirVariables({ cliente, monto: opts.monto });
    await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables).catch((error) =>
      console.error(`Error disparando regla de correo "${regla.nombre}" para cobro ${opts.buyOrderId}`, error)
    );
  }
}
