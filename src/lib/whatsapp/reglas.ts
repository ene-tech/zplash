import "server-only";

import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones as cuponesTabla } from "@/db/schema";
// Import directo a los submódulos de dataAccess (no al barrel @/lib/dataAccess)
// para no crear un ciclo con dataAccess/ventas.ts, que llama a
// evaluarReglasPorVenta (ver más abajo) e importa este archivo.
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { upsertCupones } from "@/lib/dataAccess/cupones";
import {
  listarDisparosProgramadosVencidos,
  listarReglasWhatsappActivas,
  marcarDisparoReglaWhatsapp,
  obtenerPlantillaWhatsapp,
  obtenerReglaWhatsapp,
  registrarDisparoReglaWhatsapp,
} from "@/lib/dataAccess/whatsapp";
import { fmtCLP, fmtFecha, generarCodigoCupon, uid } from "@/lib/helpers";
import { enviarMensajePlantilla } from "./enviar";
import type { Cliente, Cupon, DisparoReglaWhatsapp, Ingreso, PlantillaWhatsapp, ReglaWhatsapp, Venta } from "@/types";

const MS_POR_DIA = 86_400_000;

function coincideVenta(regla: ReglaWhatsapp, venta: Venta): boolean {
  if (regla.condicionTipoVenta && regla.condicionTipoVenta !== venta.tipo) return false;
  if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(venta.plan)) return false;
  return true;
}

function construirVariables(opts: {
  cliente: Cliente;
  monto?: number;
  montoOferta?: number;
  diasValidez?: number;
  patenteAnterior?: string;
}): Record<string, string> {
  return {
    nombre: opts.cliente.nombre || "",
    patente: opts.cliente.patente || "",
    plan: opts.cliente.plan || "",
    monto: opts.monto !== undefined ? fmtCLP(opts.monto) : "",
    fechaVencimiento: opts.cliente.vencimiento ? fmtFecha(opts.cliente.vencimiento) : "",
    montoOferta: opts.montoOferta !== undefined ? fmtCLP(opts.montoOferta) : "",
    diasValidez: opts.diasValidez !== undefined ? String(opts.diasValidez) : "",
    patenteAnterior: opts.patenteAnterior || "",
  };
}

// Arma el preview (aplicarVariables sobre plantilla.mensaje, informativo en
// logs si algo falla) y el envío real vía enviarMensajePlantilla, que exige
// metaNombre — sin eso la plantilla sigue siendo solo un borrador de
// contenido (ver comentario en @/db/schema/whatsapp) y no hay a qué template
// aprobado de Meta mandarle el mensaje.
async function enviarSegunPlantilla(plantilla: PlantillaWhatsapp, telefono: string, variables: Record<string, string>) {
  if (!plantilla.metaNombre) {
    console.error(`Plantilla WhatsApp "${plantilla.nombre}" no tiene metaNombre configurado (Web Settings → WhatsApp Webhooks); no se puede enviar`);
    return null;
  }
  // metaVariables se guarda en minúsculas (ver auto-rellenado en
  // WebSettingsWhatsappTab), pero las claves de `variables` son camelCase
  // (fechaVencimiento, montoOferta) — match insensible a mayúsculas para que
  // el admin no tenga que escribir el camelCase exacto a mano.
  const porClaveMinuscula = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k.toLowerCase(), v]));
  const parametros = (plantilla.metaVariables || []).map((v) => porClaveMinuscula[v.toLowerCase()] ?? "");
  return enviarMensajePlantilla(telefono, plantilla.metaNombre, plantilla.metaIdioma || "es", parametros, "regla-whatsapp");
}

async function generarCodigoCuponUnico(): Promise<string> {
  const existentes = await getDb().select({ codigo: cuponesTabla.codigo }).from(cuponesTabla);
  return generarCodigoCupon(new Set(existentes.map((r) => r.codigo)));
}

// Ejecuta la acción de una regla ya disparada (fila en disparos_regla_whatsapp
// ya insertada, para idempotencia) contra un cliente concreto: si corresponde
// genera el Cupon "descuento" atado a la patente (reconocible sin código al
// volver, ver OperadorFoundResult) y siempre intenta el envío de WhatsApp.
// `ventaMonto` solo se usa para el placeholder {{monto}} en reglas
// "venta_creada" (ej. "confirmamos tu compra de {{monto}}"); en
// "plan_proximo_vencer" no aplica. `patenteAnterior` solo se usa en
// "cambio_patente" (ver evaluarReglasPorCambioPatente), para el placeholder
// {{patenteAnterior}}.
async function ejecutarAccionRegla(
  regla: ReglaWhatsapp,
  disparoId: string,
  cliente: Cliente,
  ventaMonto?: number,
  patenteAnterior?: string
): Promise<void> {
  if (!cliente.telefono) {
    console.error(`Regla WhatsApp "${regla.nombre}": cliente ${cliente.id} sin teléfono, no se puede enviar`);
    await marcarDisparoReglaWhatsapp(disparoId, { estado: "error" });
    return;
  }
  const plantilla = await obtenerPlantillaWhatsapp(regla.plantillaWhatsappId);
  if (!plantilla) {
    console.error(`Regla WhatsApp "${regla.nombre}": plantilla ${regla.plantillaWhatsappId} no existe`);
    await marcarDisparoReglaWhatsapp(disparoId, { estado: "error" });
    return;
  }

  let cuponId: string | undefined;
  let montoOferta: number | undefined;
  let diasValidez: number | undefined;
  if (regla.accion === "cupon_descuento") {
    diasValidez = regla.cuponValidezDias ?? 7;
    const ahora = new Date();
    const nuevo: Cupon = {
      id: uid(),
      codigo: await generarCodigoCuponUnico(),
      nombreLote: `WhatsApp - ${regla.nombre}`,
      valor: regla.cuponValor || 0,
      numeroLote: 1,
      totalLote: 1,
      fechaCaducidad: new Date(ahora.getTime() + diasValidez * MS_POR_DIA).toISOString(),
      usado: false,
      creadoEn: ahora.toISOString(),
      creadoPor: `regla-whatsapp:${regla.id}`,
      tipo: "descuento",
      patenteAsignada: cliente.patente,
      esPorcentaje: regla.cuponEsPorcentaje || false,
    };
    const ok = await upsertCupones([nuevo]);
    if (ok) {
      cuponId = nuevo.id;
      montoOferta = regla.cuponValor;
    }
  }

  const variables = construirVariables({ cliente, monto: ventaMonto, montoOferta, diasValidez, patenteAnterior });
  const mensaje = await enviarSegunPlantilla(plantilla, cliente.telefono, variables);
  // `mensaje` siempre existe salvo que falte metaNombre — enviarMensajePlantilla
  // (@/lib/whatsapp/enviar) registra la fila de todos modos aunque la Graph
  // API rechace el envío, con estado "fallido" adentro. Hay que mirar ese
  // estado real, no solo si `mensaje` es truthy.
  await marcarDisparoReglaWhatsapp(disparoId, {
    estado: mensaje?.estado === "enviado" ? "enviado" : "error",
    cuponId,
    mensajeWhatsappId: mensaje?.id,
  });
}

async function buscarCliente(clienteId: string): Promise<Cliente | null> {
  const [row] = await getDb().select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  return row ? clienteFromRow(row) : null;
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
  if (delayDias > 0) return; // el cron lo procesa más adelante (ver procesarPendientesYVencimientos)

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
// Google 5 estrellas).
export async function evaluarReglasPorIngreso(ingresosNuevos: Ingreso[]): Promise<void> {
  if (!ingresosNuevos.length) return;
  let reglas: ReglaWhatsapp[];
  try {
    reglas = await listarReglasWhatsappActivas("ingreso_plan_registrado");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (ingreso_plan_registrado)", error);
    return;
  }
  if (!reglas.length) return;

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

// Llamado desde @/lib/db/clientes.ts::upsertClientes y desde
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

// Llamado por el cron diario (/api/whatsapp/reglas/evaluar): (1) procesa
// disparos "venta_creada" con delayDias > 0 cuya fecha ya llegó, generando
// recién ahí el Cupon (para que los días de validez cuenten desde que el
// cliente recibe el mensaje, no desde la compra); (2) evalúa reglas
// "plan_proximo_vencer" escaneando clientes por vencimiento.
export async function procesarPendientesYVencimientos(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  const ahoraISO = new Date().toISOString();

  let pendientes: DisparoReglaWhatsapp[] = [];
  try {
    pendientes = await listarDisparosProgramadosVencidos(ahoraISO);
  } catch (error) {
    console.error("Error listando disparos programados de WhatsApp", error);
  }
  for (const disparo of pendientes) {
    try {
      const regla = await obtenerReglaWhatsapp(disparo.reglaId);
      const cliente = disparo.clienteId ? await buscarCliente(disparo.clienteId) : null;
      if (!regla || !cliente) {
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" });
        errores++;
        continue;
      }
      await ejecutarAccionRegla(regla, disparo.id, cliente);
      procesados++;
    } catch (error) {
      console.error("Error procesando disparo programado de WhatsApp", disparo.id, error);
      await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
      errores++;
    }
  }

  let reglasVencimiento: ReglaWhatsapp[] = [];
  try {
    reglasVencimiento = await listarReglasWhatsappActivas("plan_proximo_vencer");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (plan_proximo_vencer)", error);
  }
  for (const regla of reglasVencimiento) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    const hastaISO = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
    const clientesRows = await getDb()
      .select()
      .from(clientes)
      .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, ahoraISO), lte(clientes.vencimiento, hastaISO)));

    for (const row of clientesRows) {
      if (regla.condicionPlanes?.length && (!row.plan || !regla.condicionPlanes.includes(row.plan))) continue;
      // origenId incluye el vencimiento exacto: si el cliente renueva y su
      // vencimiento cambia, vuelve a ser elegible para esta misma regla en el
      // ciclo nuevo en vez de quedar bloqueado para siempre por el histórico.
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${row.vencimiento}`,
        clienteId: row.id,
        patente: row.patente,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue; // ya se disparó esta regla para este ciclo de vencimiento

      try {
        await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(row));
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp de vencimiento", regla.id, row.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }

  return { procesados, errores };
}
