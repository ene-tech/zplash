import "server-only";

import { listarReglasWhatsappActivas, marcarDisparoReglaWhatsapp, registrarDisparoReglaWhatsapp } from "@/lib/dataAccess/whatsapp";
import { mesKey, uid } from "@/lib/helpers";
import { buscarCliente, ejecutarAccionRegla, MS_POR_DIA } from "./motor";
import type { Cliente, Ingreso, ReglaWhatsapp, Venta } from "@/types";

function coincideVenta(regla: ReglaWhatsapp, venta: Venta): boolean {
  if (regla.condicionTipoVenta && regla.condicionTipoVenta !== venta.tipo) return false;
  if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(venta.plan)) return false;
  return true;
}

async function dispararPorVenta(regla: ReglaWhatsapp, venta: Venta): Promise<void> {
  const delayDias = regla.delayDias || 0;
  const enviarEn = new Date(Date.now() + delayDias * MS_POR_DIA).toISOString();
  // El insert falla en silencio (retorna null) si esta venta ya disparó esta
  // regla antes (constraint único regla+origen) — necesario porque
  // insertVentas puede, en teoría, llamar esto más de una vez para el mismo
  // lote si el caller reintenta tras un error parcial.
  const disparo = await registrarDisparoReglaWhatsapp({
    id: uid(),
    reglaId: regla.id,
    origenTipo: "venta",
    origenId: venta.id,
    clienteId: venta.clienteId,
    patente: venta.patente,
    estado: "programado",
    enviarEn,
  });
  if (!disparo) return;
  if (delayDias > 0) return; // el cron lo procesa más adelante (ver procesarPendientesYVencimientos en ./cron)

  const cliente = await buscarCliente(venta.clienteId);
  if (!cliente) {
    await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" });
    return;
  }
  await ejecutarAccionRegla(regla, disparo.id, cliente, venta.precio);
}

// Se llama desde dataAccess/ventas.ts::insertVentas justo después del INSERT,
// sin awaitear el resultado (fire-and-forget) — un error acá nunca debe
// tumbar la venta que lo originó. Cubre todas las vías de creación de Venta
// (operador, Webpay, Oneclick, B2B) porque insertVentas es el único choke
// point de ventas realmente nuevas (vs. upsertVentas, usado para ediciones).
export async function evaluarReglasPorVenta(ventasNuevas: Venta[]): Promise<void> {
  if (!ventasNuevas.length) return;
  let reglas: ReglaWhatsapp[];
  try {
    reglas = await listarReglasWhatsappActivas("venta_creada");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (venta_creada)", error);
    return;
  }
  if (!reglas.length) return;

  for (const venta of ventasNuevas) {
    if (!venta.clienteId) continue; // ventas sin cliente (ej. B2B directo) no tienen a quién escribirle
    for (const regla of reglas.filter((r) => coincideVenta(r, venta))) {
      await dispararPorVenta(regla, venta).catch((error) =>
        console.error(`Error disparando regla WhatsApp "${regla.nombre}" para venta ${venta.id}`, error)
      );
    }
  }
}

// Se llama desde dataAccess/ingresos.ts::insertIngresos justo después del
// INSERT, sin awaitear el resultado (fire-and-forget) — mismo patrón que
// evaluarReglasPorVenta. Solo dispara para ingresos de un cliente con plan
// vigente al momento de registrar (planEstadoAlIngreso === "ok"): un ingreso
// "warn"/"bad" (plan por vencer/vencido) o sin clienteId (lavado sin
// registro, canje de cupón) no corresponde a la situación "cliente de plan
// que acaba de usar el servicio" que esta regla busca (ej. pedir reseña de
// Google 5 estrellas). También evalúa "primer_ingreso_mes" (mismo filtro),
// pero con origenId `${clienteId}:${mesKey}` en vez del id del Ingreso, para
// que el unique de disparos_regla_whatsapp bloquee cualquier ingreso
// siguiente del mismo cliente ese mes calendario (ver comentario en
// @/db/schema/whatsapp).
export async function evaluarReglasPorIngreso(ingresosNuevos: Ingreso[]): Promise<void> {
  if (!ingresosNuevos.length) return;
  let reglas: ReglaWhatsapp[];
  let reglasPrimerIngresoMes: ReglaWhatsapp[];
  try {
    [reglas, reglasPrimerIngresoMes] = await Promise.all([
      listarReglasWhatsappActivas("ingreso_plan_registrado"),
      listarReglasWhatsappActivas("primer_ingreso_mes"),
    ]);
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (ingreso_plan_registrado/primer_ingreso_mes)", error);
    return;
  }
  if (!reglas.length && !reglasPrimerIngresoMes.length) return;

  for (const ingreso of ingresosNuevos) {
    if (!ingreso.clienteId || ingreso.planEstadoAlIngreso !== "ok") continue;
    const cliente = await buscarCliente(ingreso.clienteId);
    if (!cliente || !cliente.plan) continue;

    for (const regla of reglas) {
      if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(cliente.plan)) continue;
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "ingreso",
        origenId: ingreso.id,
        clienteId: cliente.id,
        patente: ingreso.patente,
        estado: "programado",
        enviarEn: new Date().toISOString(),
      });
      if (!disparo) continue; // ya se disparó esta regla para este ingreso
      await ejecutarAccionRegla(regla, disparo.id, cliente).catch((error) =>
        console.error(`Error disparando regla WhatsApp "${regla.nombre}" para ingreso ${ingreso.id}`, error)
      );
    }

    for (const regla of reglasPrimerIngresoMes) {
      if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(cliente.plan)) continue;
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "ingreso",
        origenId: `${cliente.id}:${mesKey(ingreso.fecha)}`,
        clienteId: cliente.id,
        patente: ingreso.patente,
        estado: "programado",
        enviarEn: new Date().toISOString(),
      });
      if (!disparo) continue; // ya se disparó esta regla para este cliente este mes
      await ejecutarAccionRegla(regla, disparo.id, cliente).catch((error) =>
        console.error(`Error disparando regla WhatsApp "${regla.nombre}" para ingreso ${ingreso.id}`, error)
      );
    }
  }
}

// Llamado por cobrarSuscripcion (@/lib/pagos) cuando un cobro Oneclick queda
// "rechazada" — fire-and-forget, mismo patrón que evaluarReglasPorVenta (un
// error acá nunca debe afectar el resultado del cobro, que ya se resolvió).
// Sin delayDias: siempre inmediato, no hay nada que el cron diario deba
// procesar después para este tipo de evento.
export async function evaluarReglasPorCobroFallido(opts: {
  clienteId: string;
  patente: string;
  buyOrderId: string;
  monto: number;
}): Promise<void> {
  let reglas: ReglaWhatsapp[];
  try {
    reglas = await listarReglasWhatsappActivas("cobro_fallido");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (cobro_fallido)", error);
    return;
  }
  if (!reglas.length) return;

  const cliente = await buscarCliente(opts.clienteId);
  if (!cliente) return;

  for (const regla of reglas) {
    if (regla.condicionPlanes?.length && (!cliente.plan || !regla.condicionPlanes.includes(cliente.plan))) continue;
    const disparo = await registrarDisparoReglaWhatsapp({
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
    await ejecutarAccionRegla(regla, disparo.id, cliente, opts.monto).catch((error) =>
      console.error(`Error disparando regla WhatsApp "${regla.nombre}" para cobro ${opts.buyOrderId}`, error)
    );
  }
}

// Llamado desde @/lib/serverActions/clientes.ts::upsertClientes y desde
// @/lib/pagos/aplicarPagoAprobado cuando un cambio de patente pendiente
// (solicitado desde el módulo Clientes) se aplica de verdad porque el plan
// renovó a un período nuevo (ver resolverPatentePendiente en @/lib/helpers) —
// fire-and-forget, mismo patrón que evaluarReglasPorCobroFallido. `cliente`
// ya trae la patente NUEVA (post-swap); `patenteAnterior` es la que tenía
// antes, para el placeholder {{patenteAnterior}}.
export async function evaluarReglasPorCambioPatente(cliente: Cliente, patenteAnterior: string): Promise<void> {
  let reglas: ReglaWhatsapp[];
  try {
    reglas = await listarReglasWhatsappActivas("cambio_patente");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (cambio_patente)", error);
    return;
  }
  if (!reglas.length) return;

  for (const regla of reglas) {
    if (regla.condicionPlanes?.length && (!cliente.plan || !regla.condicionPlanes.includes(cliente.plan))) continue;
    // origenId incluye la patente nueva: si el cliente vuelve a cambiar de
    // patente más adelante, es un origenId distinto y vuelve a ser elegible.
    const disparo = await registrarDisparoReglaWhatsapp({
      id: uid(),
      reglaId: regla.id,
      origenTipo: "cliente",
      origenId: `${cliente.id}:${cliente.patente}`,
      clienteId: cliente.id,
      patente: cliente.patente,
      estado: "programado",
      enviarEn: new Date().toISOString(),
    });
    if (!disparo) continue; // ya se avisó este cambio de patente para este cliente

    await ejecutarAccionRegla(regla, disparo.id, cliente, undefined, patenteAnterior).catch((error) =>
      console.error(`Error disparando regla WhatsApp "${regla.nombre}" para cambio de patente de ${cliente.id}`, error)
    );
  }
}
