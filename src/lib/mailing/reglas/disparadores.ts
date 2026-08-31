import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { ingresos as ingresosTabla } from "@/db/schema";
import { listarReglasCorreoActivas, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import {
  esTarjetaWeb,
  LAVADO_UNICO_KEY,
  PLAN_ILIMITADO_LEGACY,
  periodoPlan,
  planVigente,
  sigueVigenteHoy,
  superoTopeIlimitado,
  uid,
} from "@/lib/helpers";
// Import directo al módulo y no al barrel @/lib/pagos: ese barrel arrastra
// aplicarPagoAprobado, que importa este archivo — el ciclo revienta en
// runtime.
import { cortarCobroWooCommerceLegacy } from "@/lib/pagos/cancelarSuscripcionWooCommerceLegacy";
import { buscarCliente, construirVariables, ejecutarAccionReglaCorreo } from "./motor";
import type { Cliente, Ingreso, ReglaCorreo, Venta } from "@/types";

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

/**
 * Cliente del ilimitado viejo (ver PLAN_ILIMITADO_LEGACY en @/lib/helpers/
 * precios) que acaba de pasarse del tope del X5 dentro de su ciclo: se le
 * avisa que ese plan se le termina al final del mes que ya pagó y se le
 * ofrece el X5 para que lo contrate él en la web.
 *
 * Es la contraparte de la política de rescate de ago-2026 (ver planResultante
 * en /api/webhooks/woocommerce): al que usa 5 pasadas o menos se le mantiene
 * su ilimitado y se le sigue cobrando por WooCommerce; al que se pasa se le
 * termina — pero no a mitad del mes que compró sin tope, y nunca renovándole
 * a un plan distinto sin que él lo acepte. Por eso acá, además del correo, se
 * le cancela la suscripción en WooCommerce: si siguiera viva, su próxima
 * renovación lo cobraría igual y lo dejaría en un X5 que nunca contrató.
 *
 * Cuelga de un EVENTO (insertIngresos) y no del barrido diario a propósito:
 * las reglas por cron de este motor no están disparando (ver
 * "plan_vencido"/"plan_proximo_vencer", activas desde el 16-ago-2026 y con
 * cero disparos), así que una regla nueva por cron nacería muerta.
 *
 * Fire-and-forget desde after(), igual que evaluarReglasPorIngreso: un error
 * acá nunca debe tumbar el ingreso que lo originó.
 */
export async function evaluarReglasCorreoPorTopeIlimitado(ingresosNuevos: Ingreso[]): Promise<void> {
  const clienteIds = [...new Set(ingresosNuevos.map((i) => i.clienteId).filter(Boolean))] as string[];
  if (!clienteIds.length) return;

  let reglas: ReglaCorreo[];
  try {
    reglas = await listarReglasCorreoActivas("tope_ilimitado_superado");
  } catch (error) {
    console.error("Error cargando reglas de correo (tope_ilimitado_superado)", error);
    return;
  }
  // Sin reglas configuradas NO se corta acá: el correo es el aviso, pero
  // cancelar la suscripción de WooCommerce es una acción de cobro y no puede
  // depender de que alguien haya dejado una regla de correo activa.
  const db = getDb();
  for (const clienteId of clienteIds) {
    const cliente = await buscarCliente(clienteId);
    // Solo el ilimitado viejo y solo con el plan al día — ver
    // superoTopeIlimitado, que es donde vive la regla.
    if (!cliente || planVigente(cliente) !== PLAN_ILIMITADO_LEGACY || !sigueVigenteHoy(cliente.vencimiento)) continue;

    // Pasadas del ciclo que corre HOY (no el que contiene el vencimiento, que
    // es lo que mira visitasPeriodoActual en el webhook): acá el cliente está
    // pasando en este momento.
    const { inicio, fin } = periodoPlan(cliente);
    const pasadas = (
      await db
        .select({ id: ingresosTabla.id })
        .from(ingresosTabla)
        .where(
          and(
            eq(ingresosTabla.clienteId, cliente.id),
            gte(ingresosTabla.fecha, inicio.toISOString()),
            lt(ingresosTabla.fecha, fin.toISOString())
          )
        )
    ).length;
    if (!superoTopeIlimitado(cliente, pasadas)) continue;

    // Va ANTES del correo y fuera del loop de reglas: una suscripción viva en
    // WooCommerce significa cobrarle un mes más de un plan que ya no le
    // corresponde, así que se corta una vez por cliente y pase lo que pase con
    // el aviso. La marca queda limpia, y eso mismo evita reintentarlo en cada
    // pasada siguiente (ver cortarCobroWooCommerceLegacy).
    await cortarCobroWooCommerceLegacy(cliente, cliente.patente, `se pasó del tope (${pasadas} pasadas)`);

    for (const regla of reglas) {
      // origenId con el vencimiento: un aviso por ciclo. Si el cliente renueva
      // y vuelve a pasarse el mes siguiente, es un ciclo nuevo y vuelve a
      // avisarse (mismo mecanismo que plan_vencido en ./cron).
      const disparo = await registrarDisparoReglaCorreo({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${cliente.id}:${cliente.vencimiento}`,
        clienteId: cliente.id,
        patente: cliente.patente,
        estado: "programado",
        enviarEn: new Date().toISOString(),
      });
      if (!disparo) continue; // ya se le avisó en este ciclo

      // El precio que va en el correo es el mismo que le va a cobrar la web
      // cuando entre a contratar (ver calcularOfertasPlanDeCliente): la
      // renovación anticipada si le calza un tramo, si no el X5 a secas.
      const oferta = await calcularOfertasPlanDeCliente(cliente);
      const variables = construirVariables({
        cliente,
        pasadas,
        precioRenovacion: oferta.renovacionAnticipada?.pPromo,
      });
      await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables).catch((error) =>
        console.error(`Error disparando regla de correo "${regla.nombre}" para el tope de ${cliente.patente}`, error)
      );

    }
  }
}

/**
 * Respaldo por escrito para el cliente al que se le acaba de cortar el cobro
 * automático: queda constancia de que ya no se le va a cobrar más, sin que
 * nadie tenga que redactarlo a mano. Contenido editable en Web Settings →
 * Mail Templates, igual que el resto de las reglas — el mismo motivo por el
 * que enviarInvitacionesMigracionWoo no hardcodea su texto.
 *
 * La llaman los dos caminos que cortan el cobro, con el mismo texto a
 * propósito: anularSuscripcion (@/lib/serverActions/oneclick, la baja que hace
 * el admin desde la ficha) y /api/cliente/mi-cuenta/eliminar-tarjeta (la que
 * hace el cliente solo desde Mi Cuenta). Ojo con eso al redactar la plantilla:
 * el admin le deja la tarjeta guardada y el cliente que se da de baja solo se
 * la elimina, así que el texto no puede prometer ninguna de las dos cosas.
 *
 * origenId por ciclo de plan y no por cancelación: apretar dos veces el botón
 * del mismo ciclo no le manda dos correos, pero si el cliente vuelve a
 * contratar y lo anula de nuevo es otro vencimiento y le llega de nuevo.
 */
export async function evaluarReglasCorreoPorSuscripcionCancelada(cliente: Cliente): Promise<void> {
  let reglas: ReglaCorreo[];
  try {
    reglas = await listarReglasCorreoActivas("suscripcion_cancelada");
  } catch (error) {
    console.error("Error cargando reglas de correo (suscripcion_cancelada)", error);
    return;
  }
  if (!reglas.length) {
    // Fuerte a propósito, igual que en enviarInvitacionesMigracionWoo: el
    // cobro sí se cortó, pero el cliente se quedó sin su comprobante.
    console.error('No hay ninguna ReglaCorreo activa de tipoEvento "suscripcion_cancelada" — se anuló la suscripción pero el cliente no recibió respaldo (crear una en Web Settings → Reglas Correo)');
    return;
  }

  const variables = construirVariables({ cliente });
  for (const regla of reglas) {
    const disparo = await registrarDisparoReglaCorreo({
      id: uid(),
      reglaId: regla.id,
      origenTipo: "cliente",
      origenId: `${cliente.id}:cancelacion:${cliente.vencimiento || "sin-plan"}`,
      clienteId: cliente.id,
      patente: cliente.patente,
      estado: "programado",
      enviarEn: new Date().toISOString(),
    });
    if (!disparo) continue; // ya se le mandó el respaldo de esta cancelación

    await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables).catch((error) =>
      console.error(`Error mandando el correo de respaldo de cancelación a ${cliente.patente}`, error)
    );
  }
}
