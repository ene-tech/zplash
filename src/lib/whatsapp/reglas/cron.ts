import "server-only";

import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, cupones, disparosReglaWhatsapp, ingresos, mensajesSms, reglasWhatsapp, suscripcionesOneclick, ventas } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { cuponFromRow } from "@/lib/dataAccess/cupones";
import {
  listarDisparosProgramadosVencidos,
  listarReglasWhatsappActivas,
  marcarDisparoReglaWhatsapp,
  obtenerReglaWhatsapp,
  reactivarDisparoOmitido,
  registrarDisparoReglaWhatsapp,
  tomarDisparoProgramado,
} from "@/lib/dataAccess/whatsapp";
import {
  diaCaja,
  finDelDiaSantiago,
  planDeSuscripcion,
  PLAN_X3,
  finUltimoPack,
  HORAS_VENTANA_RECOMPRA_PACK,
  KEYS_PROMOS_LAVADOS,
  normPlate,
  periodoPlan,
  planStatus,
  planVigente,
  ticketsVigentesDePatente,
  uid,
} from "@/lib/helpers";
import { patentesConAutopago } from "@/lib/mailing/reglas/cron";
import { LOTE_TICKET_REACTIVACION } from "@/lib/pagos/ticketReactivacion";
import { buscarCliente, ejecutarAccionRegla, LOTE_CUPON_SIN_VISITA, MS_POR_DIA, promoVipParaCliente } from "./motor";
import { rachaActual, type IntentoCobro } from "@/lib/pagos/politicaReintento";
import type { Cliente, Cupon, DisparoReglaWhatsapp, ReglaWhatsapp } from "@/types";

// Disparos "venta_creada" con espera (delayDias/delayMinutos) cuya hora ya
// llegó. Lo corren el cron diario (abajo) y el de cada 15 min
// (/api/whatsapp/reglas/programados); tomarDisparoProgramado evita que los
// dos manden el mismo.
export async function procesarDisparosProgramados(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let pendientes: DisparoReglaWhatsapp[] = [];
  try {
    pendientes = await listarDisparosProgramadosVencidos(new Date().toISOString());
  } catch (error) {
    console.error("Error listando disparos programados de WhatsApp", error);
  }
  for (const disparo of pendientes) {
    try {
      if (!(await tomarDisparoProgramado(disparo.id))) continue;
      const regla = await obtenerReglaWhatsapp(disparo.reglaId);
      const cliente = disparo.clienteId ? await buscarCliente(disparo.clienteId) : null;
      if (!regla || !cliente) {
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" });
        errores++;
        continue;
      }
      // Apagar una regla también frena lo que ya tenía programado.
      if (!regla.activa) {
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "omitido" });
        continue;
      }
      // El aviso de la prórroga es para el que no alcanzó a venir: si usó el
      // ticket extendido el último día, no hay nada que avisar. Va con ese
      // ticket para que {{fechaVencimientoCupon}} sea su fecha nueva y no la
      // de otro pack que tenga vivo.
      let ticketExtendido: { id: string; codigo: string; fechaCaducidad: string } | undefined;
      if (regla.tipoEvento === "pack_extendido") {
        const [t] = disparo.cuponId
          ? await getDb()
              .select({ id: cupones.id, codigo: cupones.codigo, fechaCaducidad: cupones.fechaCaducidad, usado: cupones.usado })
              .from(cupones)
              .where(eq(cupones.id, disparo.cuponId))
              .limit(1)
          : [];
        if (!t || t.usado || new Date(t.fechaCaducidad) <= new Date()) {
          await marcarDisparoReglaWhatsapp(disparo.id, { estado: "omitido" });
          continue;
        }
        ticketExtendido = t;
      }
      let monto: number | undefined;
      if (disparo.origenTipo === "venta") {
        const [venta] = await getDb()
          .select({ precio: ventas.precio, fecha: ventas.fecha })
          .from(ventas)
          .where(eq(ventas.id, disparo.origenId))
          .limit(1);
        monto = venta?.precio;
        // Una oferta no le llega al que ya compró otra cosa después (ej. el
        // upgrade a Promo 4 dentro de la hora del lavado).
        if (venta && regla.accion !== "mensaje_simple") {
          const [despues] = await getDb()
            .select({ id: ventas.id })
            .from(ventas)
            .where(and(eq(ventas.clienteId, cliente.id), gt(ventas.fecha, venta.fecha), ne(ventas.id, disparo.origenId)))
            .limit(1);
          if (despues) {
            await marcarDisparoReglaWhatsapp(disparo.id, { estado: "omitido" });
            continue;
          }
        }
      }
      await ejecutarAccionRegla(regla, disparo.id, cliente, monto, undefined, ticketExtendido);
      procesados++;
    } catch (error) {
      console.error("Error procesando disparo programado de WhatsApp", disparo.id, error);
      await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
      errores++;
    }
  }
  return { procesados, errores };
}

// Llamado por el cron diario (/api/whatsapp/reglas/evaluar): (1) procesa
// disparos "venta_creada" con delayDias > 0 cuya fecha ya llegó, generando
// recién ahí el Cupon (para que los días de validez cuenten desde que el
// cliente recibe el mensaje, no desde la compra); (2) evalúa reglas
// "plan_proximo_vencer" escaneando clientes por vencimiento; (3) evalúa
// "ticket_por_vencer" escaneando los tickets sin usar de la promo de
// reactivación.
export async function procesarPendientesYVencimientos(): Promise<{ procesados: number; errores: number }> {
  const inicioCorrida = Date.now();
  let { procesados, errores } = await procesarDisparosProgramados();
  const ahoraISO = new Date().toISOString();

  let reglasVencimiento: ReglaWhatsapp[] = [];
  try {
    reglasVencimiento = await listarReglasWhatsappActivas("plan_proximo_vencer");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (plan_proximo_vencer)", error);
  }
  const conAutopago = reglasVencimiento.length ? await patentesConAutopago() : new Set<string>();
  for (const regla of reglasVencimiento) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    const hastaISO = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
    const clientesRows = await getDb()
      .select()
      .from(clientes)
      .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, ahoraISO), lte(clientes.vencimiento, hastaISO)));

    for (const row of clientesRows) {
      // planVigente y no `row.plan` a secas, mismo motivo que en el cron de
      // correo (@/lib/mailing/reglas/cron): al que viene del ilimitado la
      // renovación le deja `plan` en "Plan X5" aunque siga usando el mes sin
      // tope que ya pagó, y filtrar por la columna deja fuera justo a esa gente.
      if (
        regla.condicionPlanes?.length &&
        !regla.condicionPlanes.includes(planVigente({ plan: row.plan ?? undefined, ilimitadoHasta: row.ilimitadoHasta ?? undefined }))
      )
        continue;
      // Cliente con cobro automático: se le renueva solo, el aviso lo confunde.
      if (row.patente && conAutopago.has(row.patente)) continue;

      // Mínimo de pasadas del ciclo en curso (ver condicionPasadasMin en
      // @/db/schema/whatsapp). Va antes de registrarDisparoReglaWhatsapp: al
      // que hoy no llega al mínimo no se le anota un disparo, así que mañana,
      // con una pasada más, vuelve a ser elegible.
      if (regla.condicionPasadasMin != null) {
        const { inicio, fin } = periodoPlan(clienteFromRow(row));
        const pasadas = (
          await getDb()
            .select({ id: ingresos.id })
            .from(ingresos)
            .where(and(eq(ingresos.clienteId, row.id), gte(ingresos.fecha, inicio.toISOString()), lt(ingresos.fecha, fin.toISOString())))
        ).length;
        if (pasadas < regla.condicionPasadasMin) continue;
      }
      // origenId incluye el vencimiento exacto: si el cliente renueva y su
      // vencimiento cambia, vuelve a ser elegible para esta misma regla en el
      // ciclo nuevo en vez de quedar bloqueado para siempre por el histórico.
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${row.vencimiento}`,
        clienteId: row.id,
        patente: row.patente ?? undefined,
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

  let reglasTicket: ReglaWhatsapp[] = [];
  try {
    reglasTicket = await listarReglasWhatsappActivas("ticket_por_vencer");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (ticket_por_vencer)", error);
  }
  for (const regla of reglasTicket) {
    const hastaISO = new Date(Date.now() + (regla.condicionDiasAntesVencimiento ?? 0) * MS_POR_DIA).toISOString();
    const filas = await getDb()
      .select({ cupon: cupones, cliente: clientes })
      .from(cupones)
      .innerJoin(clientes, eq(clientes.patente, cupones.patenteAsignada))
      .where(
        and(
          eq(cupones.nombreLote, LOTE_TICKET_REACTIVACION),
          eq(cupones.usado, false),
          gte(cupones.fechaCaducidad, ahoraISO),
          lte(cupones.fechaCaducidad, hastaISO)
        )
      );

    for (const { cupon, cliente } of filas) {
      // origenId con la fecha de caducidad: si se le alarga la vigencia al
      // ticket, vuelve a ser elegible para el aviso de la fecha nueva.
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cupon",
        origenId: `${cupon.id}:${cupon.fechaCaducidad}`,
        clienteId: cliente.id,
        patente: cliente.patente ?? undefined,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue; // ya se avisó este vencimiento

      try {
        await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(cliente), undefined, undefined, {
          id: cupon.id,
          codigo: cupon.codigo,
          fechaCaducidad: cupon.fechaCaducidad,
        });
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp de ticket por vencer", regla.id, cupon.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }

  // Primero las ofertas de plan y de pack: "sin_visita" corre al final y no
  // le manda los $3.000 a quien acaba de recibir una (ver ofertasRecientes).
  const porVencer = await procesarCuponesPorVencer(ahoraISO);
  const packsPorVencer = await procesarPacksPorVencer(ahoraISO);
  const packsVencidos = await procesarPacksVencidos(ahoraISO);
  const promoX3 = await procesarPromoPrimerMesX3(ahoraISO);
  const vencidos = await procesarPlanesVencidos(ahoraISO);
  const rechazados = await procesarCobrosRechazados(ahoraISO);
  const sinVisita = await procesarSinVisita(ahoraISO, inicioCorrida);
  const extras = [sinVisita, porVencer, packsPorVencer, packsVencidos, promoX3, vencidos, rechazados];
  return {
    procesados: procesados + extras.reduce((s, r) => s + r.procesados, 0),
    errores: errores + extras.reduce((s, r) => s + r.errores, 0),
  };
}

// Días que se le alargan, una sola vez, a los tickets de un pack que vencen
// sin usar ("pack_extendido", desde el 28-oct-2026).
export const DIAS_PRORROGA_PACK = 2;
// Horas después del fin del día chileno de la caducidad original a las que
// sale el aviso: ~10:00 del día siguiente, ya vencido según la fecha que
// conocía. Desde el fin del día y no desde la caducidad: los tickets emitidos
// antes del 28-oct-2026 vencen a la hora de la compra, no a las 23:59.
const HORAS_AVISO_PRORROGA = 10;

// "pack_extendido": los tickets de pack (atados a la patente) que vencen hoy
// sin usar y nunca se extendieron pasan a valer DIAS_PRORROGA_PACK días más.
// Se extienden ANTES de vencer y no después: el cron corre a media mañana y
// el mesón no recarga los cupones solo, así que un ticket extendido tarde se
// vería vencido justo cuando llega el cliente con el aviso. El aviso
// ("se te venció, te lo extendimos") queda programado para la mañana
// siguiente y procesarDisparosProgramados lo omite si ya lo usó. Sin reglas
// activas no se extiende nada: apagar las reglas apaga la prórroga. Cuando el
// ticket extendido se vence de verdad, sale "pack_vencido" como siempre; si lo
// usa y era el último, "ultimo_ticket_pack" (las promos de 2 y 5 lavados).
async function procesarPacksPorVencer(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("pack_extendido");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (pack_extendido)", error);
  }
  if (!reglas.length) return { procesados, errores };
  const hastaISO = new Date(Date.now() + MS_POR_DIA).toISOString();
  let filas: { cupon: typeof cupones.$inferSelect; cliente: typeof clientes.$inferSelect }[];
  try {
    filas = await getDb()
      .select({ cupon: cupones, cliente: clientes })
      .from(cupones)
      .innerJoin(clientes, eq(clientes.patente, cupones.patenteAsignada))
      .where(
        and(
          inArray(cupones.nombreLote, KEYS_PROMOS_LAVADOS),
          eq(cupones.usado, false),
          isNull(cupones.extendidoEn),
          gte(cupones.fechaCaducidad, ahoraISO),
          lt(cupones.fechaCaducidad, hastaISO)
        )
      );
  } catch (error) {
    console.error("Error buscando tickets de pack por vencer", error);
    return { procesados, errores: errores + 1 };
  }
  // Un aviso por cliente aunque se le extiendan varios tickets.
  const porCliente = new Map<string, { row: typeof clientes.$inferSelect; cuponId: string; original: string; nueva: string }>();
  for (const { cupon, cliente } of filas) {
    // El libre de una VIP no tiene patente autorizada: no es del auto.
    if (!cupon.patentesAutorizadas?.length) continue;
    const nueva = finDelDiaSantiago(new Date(new Date(cupon.fechaCaducidad).getTime() + DIAS_PRORROGA_PACK * MS_POR_DIA));
    try {
      const [extendido] = await getDb()
        .update(cupones)
        .set({ fechaCaducidad: nueva, extendidoEn: ahoraISO })
        .where(and(eq(cupones.id, cupon.id), eq(cupones.usado, false), isNull(cupones.extendidoEn)))
        .returning({ id: cupones.id });
      if (extendido) porCliente.set(cliente.id, { row: cliente, cuponId: cupon.id, original: cupon.fechaCaducidad, nueva });
    } catch (error) {
      console.error("Error extendiendo ticket de pack", cupon.id, error);
      errores++;
    }
  }
  for (const { row, cuponId, original, nueva } of porCliente.values()) {
    for (const regla of reglas) {
      try {
        const disparo = await registrarDisparoReglaWhatsapp({
          id: uid(),
          reglaId: regla.id,
          origenTipo: "prorroga",
          origenId: `${row.id}:${nueva}`,
          clienteId: row.id,
          patente: row.patente ?? undefined,
          cuponId,
          estado: "programado",
          enviarEn: new Date(new Date(finDelDiaSantiago(new Date(original))).getTime() + HORAS_AVISO_PRORROGA * 3600_000).toISOString(),
        });
        if (disparo) procesados++;
      } catch (error) {
        console.error("Error programando aviso pack_extendido", regla.id, row.id, error);
        errores++;
      }
    }
  }
  return { procesados, errores };
}

// Días hacia atrás en que se buscan tickets de pack vencidos: el cron corre
// una vez al día y la ventana del mesón es más corta que esto, así que
// promoVipParaCliente descarta los que ya no la tienen.
const DIAS_BUSQUEDA_PACK_VENCIDO = 2;

// "pack_vencido": se le vencieron tickets de un pack sin usar. Sale solo si el
// mesón le está ofreciendo la recompra (promoVipParaCliente: sin tickets vivos,
// sin plan vigente y dentro de la ventana); así el mensaje y el mesón dicen lo
// mismo. Uno por ventana de recompra: origenId con el cliente y el límite de
// la oferta (dos packs vencidos juntos abren una sola ventana).
async function procesarPacksVencidos(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("pack_vencido");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (pack_vencido)", error);
  }
  if (!reglas.length) return { procesados, errores };
  const desdeISO = new Date(Date.now() - DIAS_BUSQUEDA_PACK_VENCIDO * MS_POR_DIA).toISOString();
  let filas: { cupon: typeof cupones.$inferSelect; cliente: typeof clientes.$inferSelect }[];
  try {
    filas = await getDb()
      .select({ cupon: cupones, cliente: clientes })
      .from(cupones)
      .innerJoin(clientes, eq(clientes.patente, cupones.patenteAsignada))
      .where(
        and(
          inArray(cupones.nombreLote, KEYS_PROMOS_LAVADOS),
          eq(cupones.usado, false),
          gte(cupones.fechaCaducidad, desdeISO),
          lt(cupones.fechaCaducidad, ahoraISO)
        )
      );
  } catch (error) {
    console.error("Error buscando tickets de pack vencidos", error);
    return { procesados, errores: errores + 1 };
  }
  // El libre de una VIP no tiene patente autorizada: no es del auto.
  const porCliente = new Map<string, typeof clientes.$inferSelect>();
  for (const { cupon, cliente } of filas) {
    if (cupon.patentesAutorizadas?.length) porCliente.set(cliente.id, cliente);
  }
  for (const row of porCliente.values()) {
    const cliente = clienteFromRow(row);
    let vence: string;
    try {
      const oferta = await promoVipParaCliente(cliente);
      if (!oferta) continue;
      vence = oferta.vence;
    } catch (error) {
      console.error("Error calculando la recompra de un pack vencido", row.id, error);
      errores++;
      continue;
    }
    for (const regla of reglas) {
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${vence}`,
        clienteId: row.id,
        patente: row.patente ?? undefined,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue;
      try {
        await ejecutarAccionRegla(regla, disparo.id, cliente);
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp pack_vencido", regla.id, row.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }
  return { procesados, errores };
}

// Días de margen para "sin_visita": si el cron no corre un día, el cliente
// que cumplió N días ayer igual entra hoy. El origenId evita el doble envío.
const DIAS_VENTANA_SIN_VISITA = 3;

// "sin_visita": cliente que lleva N días (condicionDiasAntesVencimiento) sin
// pasar por el túnel y no tiene plan vigente — al de plan vigente no se le
// recuerda que no viene (cree que le van a cortar el plan). Una regla por
// cada umbral y canal (15, 30, 45, 65, 90 y 120 días desde el 23-nov-2026;
// antes 18, 30, 45 y 65). origenId con la fecha de la última
// visita y los días: si vuelve, la cuenta empieza de nuevo.
async function procesarSinVisita(ahoraISO: string, inicioCorrida: number): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("sin_visita");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (sin_visita)", error);
  }
  // Desde el inicio de la corrida y no de este paso: las reglas de antes
  // también gastan del maxDuration de la ruta.
  const limite = inicioCorrida + PRESUPUESTO_MS_CORRIDA;
  let prioridad: Awaited<ReturnType<typeof prioridadSinVisita>> | undefined;
  // Correos de a uno cada INTERVALO_MS_CORREO: Resend rechaza (429) si se le
  // mandan varios por segundo y el disparo quedaría "error" para siempre.
  let turnoCorreo = Promise.resolve();
  const esperarTurnoCorreo = () => {
    const mio = turnoCorreo.then(() => new Promise<void>((r) => setTimeout(r, INTERVALO_MS_CORREO)));
    turnoCorreo = mio;
    return mio;
  };
  // Umbral más alto ya enviado por cliente y última visita: al que ya recibió
  // uno más alto no se le manda uno más bajo (pasa al mover umbrales, ej. el
  // 18 que pasó a 15 el 23-nov-2026: el que recibió el de 18 no recibe el de 15).
  const umbralEnviado = new Map<string, number>();
  try {
    const enviados = await getDb()
      .select({ origenId: disparosReglaWhatsapp.origenId })
      .from(disparosReglaWhatsapp)
      .where(
        and(
          inArray(
            disparosReglaWhatsapp.reglaId,
            reglas.map((r) => r.id)
          ),
          eq(disparosReglaWhatsapp.origenTipo, "cliente"),
          eq(disparosReglaWhatsapp.estado, "enviado"),
          gte(disparosReglaWhatsapp.creadoEn, new Date(Date.now() - DIAS_HISTORIA_SIN_VISITA * MS_POR_DIA).toISOString())
        )
      );
    for (const { origenId } of enviados) {
      const corte = origenId.lastIndexOf(":");
      const clave = origenId.slice(0, corte);
      const d = Number(origenId.slice(corte + 1));
      if (Number.isFinite(d) && d > (umbralEnviado.get(clave) ?? 0)) umbralEnviado.set(clave, d);
    }
  } catch (error) {
    console.error("Error leyendo los umbrales ya enviados de sin_visita", error);
    return { procesados, errores: errores + 1 };
  }
  // Las reglas del mismo umbral (SMS y correo) comparten el cupón (su id sale
  // del origenId): se procesan juntas por cliente, con un solo chequeo de
  // prioridad. Si no, el cupón que deja el SMS bloquearía al correo.
  const porUmbral = new Map<number, ReglaWhatsapp[]>();
  for (const regla of reglas) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    if (dias > 0) porUmbral.set(dias, [...(porUmbral.get(dias) ?? []), regla]);
  }
  for (const [dias, grupo] of porUmbral) {
    // La ventana dura lo que el cupón (23-nov-2026): con la validez igual a la
    // distancia al umbral siguiente (15→30→45→65→90→120), el cliente que no
    // vuelve no queda días sin descuento entre un umbral y otro, y el que
    // quedó bloqueado por la prioridad lo recibe apenas se le libera.
    const ventana = Math.max(...grupo.map((r) => r.cuponValidezDias ?? 0), DIAS_VENTANA_SIN_VISITA);
    const hasta = new Date(Date.now() - dias * MS_POR_DIA).toISOString();
    const desde = new Date(Date.now() - (dias + ventana) * MS_POR_DIA).toISOString();
    let filas: (typeof clientes.$inferSelect)[];
    // Disparos que estas reglas ya registraron en la ventana ("regla|origen"
    // → estado): con la ventana larga casi todos los clientes ya tienen el
    // suyo, y probar el insert uno por uno serían miles de idas a la base.
    let previos: Map<string, string>;
    try {
      const [cli, prev] = await Promise.all([
        getDb()
          .select()
          .from(clientes)
          .where(and(isNotNull(clientes.ultimaVisita), gt(clientes.ultimaVisita, desde), lte(clientes.ultimaVisita, hasta))),
        getDb()
          .select({ reglaId: disparosReglaWhatsapp.reglaId, origenId: disparosReglaWhatsapp.origenId, estado: disparosReglaWhatsapp.estado })
          .from(disparosReglaWhatsapp)
          .where(
            and(
              inArray(
                disparosReglaWhatsapp.reglaId,
                grupo.map((r) => r.id)
              ),
              eq(disparosReglaWhatsapp.origenTipo, "cliente"),
              gte(disparosReglaWhatsapp.creadoEn, desde)
            )
          ),
      ]);
      filas = cli;
      previos = new Map(prev.map((p) => [`${p.reglaId}|${p.origenId}`, p.estado]));
    } catch (error) {
      console.error("Error buscando clientes sin visita", dias, error);
      errores++;
      continue;
    }

    const procesarCliente = async (row: typeof clientes.$inferSelect) => {
      // Mismo criterio que el mesón (incluye el último día y la espera de Woo).
      if (row.vencimiento && planStatus(clienteFromRow(row)).label !== "Vencido") return;
      if ((umbralEnviado.get(`${row.id}:${row.ultimaVisita}`) ?? 0) > dias) return;
      const origenId = `${row.id}:${row.ultimaVisita}:${dias}`;
      // Enviado, con error o en curso: no se repite. Solo el "omitido" se reintenta.
      const pendientes = grupo.filter((r) => {
        const previo = previos.get(`${r.id}|${origenId}`);
        return !previo || previo === "omitido";
      });
      if (!pendientes.length) return;
      // Prioridad de ofertas (19-nov-2026): los $3.000 no le llegan a quien
      // tiene un ticket o un descuento vivo (no los usa: 0 de 161 en nov) ni
      // a quien recibió otra oferta en los últimos 7 días. Queda "omitido"
      // (id "prio-…", para medirlo) y se reintenta cada día mientras siga
      // en la ventana: sale apenas se le libera (23-nov-2026).
      const p = prioridad!;
      // El cupón de este mismo umbral (id "desc…-<origenId>", lo deja el otro
      // canal) no cuenta como descuento vivo.
      const vivosAjenos = row.patente ? (p.conTicketODescuento.get(row.patente) ?? []).filter((id) => !id.endsWith(`-${origenId}`)) : [];
      const bloqueado =
        vivosAjenos.length > 0 ||
        (!!row.patente && p.ofertaReciente.patentes.has(row.patente)) ||
        p.ofertaReciente.clientes.has(row.id) ||
        (!!telefonoClave(row.telefono) && p.ofertaReciente.telefonos.has(telefonoClave(row.telefono)));
      for (const regla of pendientes) {
        const previo = previos.get(`${regla.id}|${origenId}`);
        if (previo && bloqueado) continue;
        const disparo = previo
          ? await reactivarDisparoOmitido(regla.id, "cliente", origenId)
          : await registrarDisparoReglaWhatsapp({
              id: bloqueado ? `prio-${uid()}` : uid(),
              reglaId: regla.id,
              origenTipo: "cliente",
              origenId,
              clienteId: row.id,
              patente: row.patente ?? undefined,
              estado: bloqueado ? "omitido" : "programado",
              enviarEn: ahoraISO,
            });
        if (!disparo || bloqueado) continue;
        try {
          if (regla.canal === "correo") await esperarTurnoCorreo();
          await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(row));
          procesados++;
        } catch (error) {
          console.error("Error disparando regla WhatsApp sin_visita", regla.id, row.id, error);
          await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
          errores++;
        }
      }
    };

    // De a varios en paralelo y cortando antes del límite de la función: un
    // corte a mitad dejaría disparos "programado" que nadie retoma. El que no
    // alcanzó queda sin registrar y entra en la corrida de mañana.
    if (!filas.length) continue;
    try {
      prioridad ??= await prioridadSinVisita(ahoraISO);
    } catch (error) {
      console.error("Error calculando la prioridad de ofertas sin_visita", error);
      errores++;
      break;
    }
    const cola = [...filas];
    const trabajador = async () => {
      while (cola.length && Date.now() <= limite) {
        const row = cola.shift()!;
        try {
          await procesarCliente(row);
        } catch (error) {
          // Un fallo de base con un cliente no corta al resto ni la corrida.
          console.error("Error procesando cliente sin_visita", dias, row.id, error);
          errores++;
        }
      }
    };
    await Promise.all(Array.from({ length: PARALELO_SIN_VISITA }, trabajador));
    if (Date.now() > limite) {
      console.warn("sin_visita: se acabó el tiempo de la corrida, el resto sale mañana", dias, cola.length);
      break;
    }
  }
  return { procesados, errores };
}

// "sin_visita" deja de tomar clientes a los 240 s de empezada la corrida (la
// ruta tiene maxDuration 300 s; el margen cubre a los que están en curso).
const PRESUPUESTO_MS_CORRIDA = 240_000;
const PARALELO_SIN_VISITA = 3;
const INTERVALO_MS_CORREO = 600;
// Cuánto atrás mirar los umbrales ya enviados: más que el último umbral más
// su ventana (120 + 30).
const DIAS_HISTORIA_SIN_VISITA = 180;

/** Los últimos 9 dígitos del teléfono: el mismo celular escrito con o sin +56. */
const telefonoClave = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-9);

// Ofertas que le ganan a los $3.000 de "sin_visita" si salieron en los
// últimos DIAS_OFERTA_RECIENTE días.
const EVENTOS_OFERTA = ["fin_pack_x3", "habitual_sin_plan", "plan_vencido_dias", "pack_vencido", "ultimo_ticket_pack"];
const DIAS_OFERTA_RECIENTE = 7;

/** Lo que bloquea los $3.000 de "sin_visita" (ver procesarSinVisita): patentes
 * con un ticket o un descuento vivo, y clientes, patentes o teléfonos que
 * recibieron otra oferta (regla o campaña manual por SMS) en los últimos
 * DIAS_OFERTA_RECIENTE días. Se lee una vez por corrida. */
async function prioridadSinVisita(ahoraISO: string) {
  const db = getDb();
  const desde = new Date(new Date(ahoraISO).getTime() - DIAS_OFERTA_RECIENTE * MS_POR_DIA).toISOString();
  const [vivos, disparos, campanas] = await Promise.all([
    db
      .select({ id: cupones.id, tipo: cupones.tipo, patenteAsignada: cupones.patenteAsignada, patentesAutorizadas: cupones.patentesAutorizadas })
      .from(cupones)
      .where(
        and(
          eq(cupones.usado, false),
          gt(cupones.fechaCaducidad, ahoraISO),
          or(and(eq(cupones.tipo, "vale"), isNotNull(cupones.patentesAutorizadas)), and(eq(cupones.tipo, "descuento"), isNotNull(cupones.patenteAsignada)))
        )
      ),
    db
      .select({ clienteId: disparosReglaWhatsapp.clienteId, patente: disparosReglaWhatsapp.patente, telefono: clientes.telefono })
      .from(disparosReglaWhatsapp)
      .innerJoin(reglasWhatsapp, eq(reglasWhatsapp.id, disparosReglaWhatsapp.reglaId))
      .leftJoin(clientes, eq(clientes.id, disparosReglaWhatsapp.clienteId))
      .where(
        and(
          inArray(reglasWhatsapp.tipoEvento, EVENTOS_OFERTA),
          eq(disparosReglaWhatsapp.estado, "enviado"),
          gte(disparosReglaWhatsapp.creadoEn, desde)
        )
      ),
    db
      .select({ clienteId: mensajesSms.clienteId, telefono: mensajesSms.telefono })
      .from(mensajesSms)
      // Un "…recordatorio…" solo recuerda descuentos ya emitidos: no es una
      // oferta nueva, así que no bloquea (23-nov-2026; el del 16-nov dejó sin
      // los $3.000 a ~130 que justo cumplían un umbral).
      .where(
        and(
          sql`${mensajesSms.campana} not like 'regla:%'`,
          sql`${mensajesSms.campana} not like '%recordatorio%'`,
          eq(mensajesSms.estado, "enviado"),
          gte(mensajesSms.creadoEn, desde)
        )
      ),
  ]);
  // patente → ids de sus cupones vivos (el id deja reconocer el cupón que
  // ya emitió el mismo umbral, que no debe bloquear al otro canal).
  const conTicketODescuento = new Map<string, string[]>();
  const agregar = (patente: string, id: string) => conTicketODescuento.set(patente, [...(conTicketODescuento.get(patente) ?? []), id]);
  for (const c of vivos) {
    if (c.tipo === "vale") for (const p of c.patentesAutorizadas ?? []) agregar(p, c.id);
    else if (c.patenteAsignada) agregar(c.patenteAsignada, c.id);
  }
  const ofertaReciente = { clientes: new Set<string>(), patentes: new Set<string>(), telefonos: new Set<string>() };
  for (const d of [...disparos, ...campanas]) {
    if (d.clienteId) ofertaReciente.clientes.add(d.clienteId);
    if ("patente" in d && d.patente) ofertaReciente.patentes.add(d.patente);
    const t = telefonoClave(d.telefono);
    if (t) ofertaReciente.telefonos.add(t);
  }
  return { conTicketODescuento, ofertaReciente };
}

// "cupon_por_vencer": recordatorio N días antes de que venza el descuento de
// "sin_visita" (lote LOTE_CUPON_SIN_VISITA, atado a la patente) sin usar.
async function procesarCuponesPorVencer(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("cupon_por_vencer");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (cupon_por_vencer)", error);
  }
  for (const regla of reglas) {
    const hastaISO = new Date(Date.now() + (regla.condicionDiasAntesVencimiento ?? 0) * MS_POR_DIA).toISOString();
    let filas: { cupon: typeof cupones.$inferSelect; cliente: typeof clientes.$inferSelect }[];
    try {
      filas = await getDb()
        .select({ cupon: cupones, cliente: clientes })
        .from(cupones)
        .innerJoin(clientes, eq(clientes.patente, cupones.patenteAsignada))
        .where(
          and(
            eq(cupones.nombreLote, LOTE_CUPON_SIN_VISITA),
            eq(cupones.usado, false),
            gte(cupones.fechaCaducidad, ahoraISO),
            lte(cupones.fechaCaducidad, hastaISO)
          )
        );
    } catch (error) {
      console.error("Error buscando descuentos sin visita por vencer", regla.id, error);
      errores++;
      continue;
    }
    for (const { cupon, cliente } of filas) {
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cupon",
        origenId: `${cupon.id}:${cupon.fechaCaducidad}`,
        clienteId: cliente.id,
        patente: cliente.patente ?? undefined,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue;
      try {
        await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(cliente), undefined, undefined, {
          id: cupon.id,
          codigo: cupon.codigo,
          fechaCaducidad: cupon.fechaCaducidad,
        });
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp de cupón por vencer", regla.id, cupon.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }
  return { procesados, errores };
}

// Días de margen de "fin_pack_x3": si el cron no corre un día, el que cerró
// su ventana de recompra ayer igual entra hoy. El origenId evita el doble envío.
const DIAS_VENTANA_FIN_PACK_X3 = 3;
// "habitual_sin_plan": días con lavado (sin contar garantías) dentro de los
// últimos DIAS_HABITUAL_SIN_PLAN para recibir la oferta.
const DIAS_CON_LAVADO_HABITUAL = 2;
const DIAS_HABITUAL_SIN_PLAN = 30;
// Hasta cuántos días atrás se leen los tickets de pack ya caducados.
const DIAS_TICKETS_PROMO_X3 = 60;

/**
 * Promo del primer mes del Plan X3 (nov-2026): descuento atado a la patente
 * que solo rebaja el primer cobro del X3 (ver esCuponSoloX3), por SMS y correo
 * con el link que llega con el X3 elegido. Dos momentos:
 * - "fin_pack_x3": terminó su último pack de tickets (gastó el último o se le
 *   vencieron) y la ventana de recompra del mesón (HORAS_VENTANA_RECOMPRA_PACK,
 *   "pack_vencido" / "ultimo_ticket_pack") se cerró sin que comprara otro
 *   pack. Va después de esa ventana y no junto con ella, para no ofrecer dos
 *   cosas a la vez.
 * - "habitual_sin_plan": viene seguido (DIAS_CON_LAVADO_HABITUAL días con
 *   lavado en DIAS_HABITUAL_SIN_PLAN días) pagando lavado por lavado.
 * Para los dos: "Sin plan" (nunca tuvo plan: al X5 vencido no se le ofrece,
 * tiene su propia reactivación), sin tickets vivos, sin cobro automático
 * (Oneclick activa o Woo) y una sola vez por cliente: el origenId es el mismo
 * en las dos, así que el cupón es uno (ver cuponDelDisparo) y el que ya la
 * recibió por un camino no la recibe por el otro.
 */
async function procesarPromoPrimerMesX3(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglasFinPack: ReglaWhatsapp[] = [];
  let reglasHabitual: ReglaWhatsapp[] = [];
  try {
    [reglasFinPack, reglasHabitual] = await Promise.all([
      listarReglasWhatsappActivas("fin_pack_x3"),
      listarReglasWhatsappActivas("habitual_sin_plan"),
    ]);
  } catch (error) {
    console.error("Error cargando reglas de la promo del primer mes del Plan X3", error);
    return { procesados, errores: errores + 1 };
  }
  if (!reglasFinPack.length && !reglasHabitual.length) return { procesados, errores };

  const db = getDb();
  const ahora = new Date(ahoraISO);
  const conAutopago = await patentesConAutopago();
  // Tickets de pack (vivos y pasados) de una sola vez, no una consulta por
  // cliente: deciden "sin tickets vivos" y cuándo terminó el último pack. Los
  // que caducaron hace más de DIAS_TICKETS_PROMO_X3 no cambian ninguna de las
  // dos cosas (un pack dura 30 días como mucho, más la prórroga).
  const ticketsPorPatente = new Map<string, Cupon[]>();
  for (const row of await db
    .select()
    .from(cupones)
    .where(
      and(
        inArray(cupones.nombreLote, KEYS_PROMOS_LAVADOS),
        gte(cupones.fechaCaducidad, new Date(ahora.getTime() - DIAS_TICKETS_PROMO_X3 * MS_POR_DIA).toISOString())
      )
    )) {
    const c = cuponFromRow(row);
    for (const p of c.patentesAutorizadas ?? []) ticketsPorPatente.set(p, [...(ticketsPorPatente.get(p) ?? []), c]);
  }
  const ticketsDe = (patente: string) => ticketsPorPatente.get(normPlate(patente)) ?? [];
  // Clientes que ya la recibieron por cualquiera de
  // los dos momentos: no se les vuelve a evaluar.
  const yaTuvieron = new Set(
    (
      await db
        .select({ origenId: disparosReglaWhatsapp.origenId })
        .from(disparosReglaWhatsapp)
        .innerJoin(reglasWhatsapp, eq(reglasWhatsapp.id, disparosReglaWhatsapp.reglaId))
        .where(inArray(reglasWhatsapp.tipoEvento, ["fin_pack_x3", "habitual_sin_plan"]))
    ).map((r) => r.origenId)
  );

  const disparar = async (reglas: ReglaWhatsapp[], row: typeof clientes.$inferSelect) => {
    if (!row.patente || conAutopago.has(row.patente)) return;
    const cliente = clienteFromRow(row);
    if (row.vencimiento || planStatus(cliente).cls !== "bad") return;
    const origenId = `x3:${row.id}`;
    if (yaTuvieron.has(origenId)) return;
    yaTuvieron.add(origenId);
    for (const regla of reglas) {
      try {
        const disparo = await registrarDisparoReglaWhatsapp({
          id: uid(),
          reglaId: regla.id,
          origenTipo: "cliente",
          origenId,
          clienteId: row.id,
          patente: row.patente,
          // Sin grupo de control desde el 19-nov-2026: el dueño prefirió
          // que le llegue a todos ("es venta y tiene que hacerse").
          estado: "programado",
          enviarEn: ahoraISO,
        });
        if (!disparo) continue;
        await ejecutarAccionRegla(regla, disparo.id, cliente);
        procesados++;
      } catch (error) {
        console.error("Error disparando la promo del primer mes del Plan X3", regla.id, row.id, error);
        errores++;
      }
    }
  };

  if (reglasFinPack.length) {
    // Packs cuya ventana de recompra se cerró en los últimos
    // DIAS_VENTANA_FIN_PACK_X3 días: el fin del pack (último uso o
    // caducidad) entre `desde` y `hasta`.
    const hasta = new Date(ahora.getTime() - HORAS_VENTANA_RECOMPRA_PACK * 3600_000);
    const desde = new Date(hasta.getTime() - DIAS_VENTANA_FIN_PACK_X3 * MS_POR_DIA);
    try {
      const filas = await db
        .select({ cliente: clientes })
        .from(cupones)
        .innerJoin(clientes, eq(clientes.patente, cupones.patenteAsignada))
        .where(
          and(
            inArray(cupones.nombreLote, KEYS_PROMOS_LAVADOS),
            isNull(clientes.vencimiento),
            or(
              and(eq(cupones.usado, true), gte(cupones.fechaUso, desde.toISOString()), lt(cupones.fechaUso, hasta.toISOString())),
              and(eq(cupones.usado, false), gte(cupones.fechaCaducidad, desde.toISOString()), lt(cupones.fechaCaducidad, hasta.toISOString()))
            )
          )
        );
      const porCliente = new Map(filas.map((f) => [f.cliente.id, f.cliente]));
      for (const row of porCliente.values()) {
        const fin = finUltimoPack(ticketsDe(row.patente ?? ""), row.patente ?? "", ahora);
        if (!fin || fin < desde.getTime() || fin >= hasta.getTime()) continue;
        await disparar(reglasFinPack, row);
      }
    } catch (error) {
      console.error("Error buscando packs terminados para la promo del Plan X3", error);
      errores++;
    }
  }

  if (reglasHabitual.length) {
    const desde = new Date(ahora.getTime() - DIAS_HABITUAL_SIN_PLAN * MS_POR_DIA).toISOString();
    try {
      const filas = await db
        .select()
        .from(clientes)
        .where(
          and(
            isNull(clientes.vencimiento),
            isNotNull(clientes.patente),
            inArray(
              clientes.id,
              sql`(select i.cliente_id from ingresos i
                   where i.cliente_id is not null and not i.es_garantia and i.fecha >= ${desde}::timestamptz
                   group by i.cliente_id
                   having count(distinct (i.fecha at time zone 'America/Santiago')::date) >= ${DIAS_CON_LAVADO_HABITUAL})`
            )
          )
        );
      for (const row of filas) {
        // El que todavía tiene tickets de pack va por "fin_pack_x3" cuando se
        // le acaben.
        if (ticketsVigentesDePatente(ticketsDe(row.patente ?? ""), row.patente ?? "", ahora).length) continue;
        await disparar(reglasHabitual, row);
      }
    } catch (error) {
      console.error("Error buscando habituales sin plan para la promo del Plan X3", error);
      errores++;
    }
  }
  return { procesados, errores };
}

// ---------------------------------------------------------------------------
// Oportunidades comerciales del 19-nov-2026 (informe del agente comercial):
// plan vencido sin volver, cobro automático rechazado que nunca se recupera e
// inscripción de tarjeta a medias. Ninguna lleva descuento ni grupo de
// control: el dueño quiere que le llegue a todos.
// ---------------------------------------------------------------------------

// Días de margen de los avisos por días cumplidos: si el cron no corre un día,
// el que los cumplió ayer igual entra hoy. El origenId evita el doble envío.
const DIAS_VENTANA_AVISO = 3;

/** Día calendario de Chile como entero (mismo conteo que politicaReintento). */
const diaChileNum = (fecha: string | Date) => Date.parse(diaCaja(new Date(fecha).toISOString()) + "T00:00:00Z") / MS_POR_DIA;

/**
 * "plan_vencido_dias": cliente cuyo plan venció hace N días
 * (condicionDiasAntesVencimiento) y no volvió. Sin cobro automático vivo (ese
 * va por "cobro_rechazado_recordatorio") y con el plan "Vencido" según el
 * mismo criterio del mesón (incluye la espera de Woo). Una regla por umbral
 * (ej. 1 y 7 días el X5, 21 días la oferta del X3). origenId con el
 * vencimiento: si renueva y vuelve a vencer, vuelve a ser elegible.
 */
export async function procesarPlanesVencidos(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("plan_vencido_dias");
  } catch (error) {
    console.error("Error cargando reglas (plan_vencido_dias)", error);
    return { procesados, errores: errores + 1 };
  }
  if (!reglas.length) return { procesados, errores };
  const conAutopago = await patentesConAutopago();
  for (const regla of reglas) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    if (dias <= 0) continue;
    const hasta = new Date(Date.now() - dias * MS_POR_DIA).toISOString();
    const desde = new Date(Date.now() - (dias + DIAS_VENTANA_AVISO) * MS_POR_DIA).toISOString();
    let filas: (typeof clientes.$inferSelect)[];
    try {
      filas = await getDb()
        .select()
        .from(clientes)
        .where(and(isNotNull(clientes.vencimiento), gt(clientes.vencimiento, desde), lte(clientes.vencimiento, hasta)));
    } catch (error) {
      console.error("Error buscando planes vencidos", regla.id, error);
      errores++;
      continue;
    }
    for (const row of filas) {
      if (!row.patente || conAutopago.has(row.patente)) continue;
      const cliente = clienteFromRow(row);
      if (planStatus(cliente).label !== "Vencido") continue;
      if (regla.condicionPlanes?.length && !regla.condicionPlanes.includes(row.plan ?? "")) continue;
      // Mínimo / máximo de pasadas en su último mes de plan (sin garantías).
      // La oferta del X3 va solo a quien usaba 3 o menos: al que usaba 4-5,
      // pasarlo al X3 le baja $5.000 al mes (informe comercial 19-nov-2026).
      if (regla.condicionPasadasMin != null || regla.condicionPasadasMax != null) {
        const fin = new Date(row.vencimiento!);
        const inicio = new Date(fin);
        inicio.setMonth(inicio.getMonth() - 1);
        const pasadas = (
          await getDb()
            .select({ id: ingresos.id })
            .from(ingresos)
            .where(
              and(
                eq(ingresos.clienteId, row.id),
                eq(ingresos.esGarantia, false),
                gte(ingresos.fecha, inicio.toISOString()),
                lt(ingresos.fecha, fin.toISOString())
              )
            )
        ).length;
        if (regla.condicionPasadasMin != null && pasadas < regla.condicionPasadasMin) continue;
        if (regla.condicionPasadasMax != null && pasadas > regla.condicionPasadasMax) continue;
      }
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${row.vencimiento}:${dias}`,
        clienteId: row.id,
        patente: row.patente,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue;
      try {
        await ejecutarAccionRegla(regla, disparo.id, cliente);
        procesados++;
      } catch (error) {
        console.error("Error disparando regla plan_vencido_dias", regla.id, row.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }
  return { procesados, errores };
}

/**
 * "cobro_rechazado_recordatorio": el cobro automático de su plan lleva N días
 * (condicionDiasAntesVencimiento, contados desde el primer rechazo de la racha,
 * ver rachaActual) sin pasar. El aviso del primer rechazo es "cobro_fallido";
 * éste insiste antes de que la baja del día 21 cancele la suscripción (ver
 * bajaPorCobroFallido). Solo suscripciones "activa": la "suspendida" es una
 * pausa del cliente o del admin.
 */
export async function procesarCobrosRechazados(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("cobro_rechazado_recordatorio");
  } catch (error) {
    console.error("Error cargando reglas (cobro_rechazado_recordatorio)", error);
    return { procesados, errores: errores + 1 };
  }
  if (!reglas.length) return { procesados, errores };
  const db = getDb();
  const hoy = diaChileNum(ahoraISO);
  try {
    // Cobros de los últimos 30 días de las suscripciones activas: una racha
    // que importa (hasta el día 21) empezó dentro de esa ventana.
    const desde = new Date(Date.now() - 30 * MS_POR_DIA).toISOString();
    const filas = await db
      .select({ suscripcion: suscripcionesOneclick, cobro: cobrosOneclick })
      .from(cobrosOneclick)
      .innerJoin(suscripcionesOneclick, eq(suscripcionesOneclick.id, cobrosOneclick.suscripcionId))
      .where(and(eq(suscripcionesOneclick.estado, "activa"), gte(cobrosOneclick.creadoEn, desde)));
    const porSuscripcion = new Map<string, { suscripcion: typeof suscripcionesOneclick.$inferSelect; cobros: IntentoCobro[] }>();
    for (const { suscripcion, cobro } of filas) {
      const g = porSuscripcion.get(suscripcion.id) ?? { suscripcion, cobros: [] };
      g.cobros.push({ id: cobro.id, estado: cobro.estado, responseCode: cobro.responseCode, creadoEn: cobro.creadoEn, monto: cobro.monto });
      porSuscripcion.set(suscripcion.id, g);
    }
    for (const { suscripcion, cobros } of porSuscripcion.values()) {
      const historial = cobros.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
      const racha = rachaActual(historial, suscripcion.proximoCobro);
      if (!racha.length) continue;
      const diasRacha = hoy - diaChileNum(racha[0].creadoEn);
      const [row] = await db.select().from(clientes).where(eq(clientes.patente, suscripcion.patente)).limit(1);
      if (!row) continue;
      const cliente = clienteFromRow(row);
      for (const regla of reglas) {
        const dias = regla.condicionDiasAntesVencimiento ?? 0;
        if (dias <= 0 || diasRacha < dias || diasRacha >= dias + DIAS_VENTANA_AVISO) continue;
        const disparo = await registrarDisparoReglaWhatsapp({
          id: uid(),
          reglaId: regla.id,
          origenTipo: "cobro",
          origenId: `${suscripcion.id}:${racha[0].id}:${dias}`,
          clienteId: row.id,
          patente: suscripcion.patente,
          estado: "programado",
          enviarEn: ahoraISO,
        });
        if (!disparo) continue;
        try {
          await ejecutarAccionRegla(regla, disparo.id, cliente, racha.at(-1)!.monto);
          procesados++;
        } catch (error) {
          console.error("Error disparando regla cobro_rechazado_recordatorio", regla.id, suscripcion.id, error);
          await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
          errores++;
        }
      }
    }
  } catch (error) {
    console.error("Error buscando cobros rechazados", error);
    errores++;
  }
  return { procesados, errores };
}

// Hasta cuántas horas después de quedar a medias se le escribe a una
// inscripción de tarjeta: más tarde ya no se acuerda de qué se trataba.
const HORAS_MAX_INSCRIPCION_PENDIENTE = 48;

/**
 * "inscripcion_pendiente": empezó a inscribir la tarjeta para contratar el
 * plan (suscripción "pendiente") y no terminó en Transbank. Una regla por
 * espera (condicionDiasAntesVencimiento = HORAS desde que quedó a medias, ej.
 * 1 y 24). Lo corre el cron de cada 15 min, para que el de 1 hora llegue a la
 * hora. Una vez por patente y regla (no por intento): el que abandona dos
 * veces no recibe cuatro mensajes. No sale si ya tiene otra tarjeta viva o el
 * plan vigente (terminó por otro lado).
 */
export async function procesarInscripcionesPendientes(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("inscripcion_pendiente");
  } catch (error) {
    console.error("Error cargando reglas (inscripcion_pendiente)", error);
    return { procesados, errores: errores + 1 };
  }
  if (!reglas.length) return { procesados, errores };
  const db = getDb();
  const ahora = Date.now();
  try {
    const pendientes = await db
      .select()
      .from(suscripcionesOneclick)
      .where(
        and(
          eq(suscripcionesOneclick.estado, "pendiente"),
          gte(
            sql`coalesce(${suscripcionesOneclick.actualizadoEn}, ${suscripcionesOneclick.creadoEn})`,
            new Date(ahora - HORAS_MAX_INSCRIPCION_PENDIENTE * 3600_000).toISOString()
          )
        )
      );
    if (!pendientes.length) return { procesados, errores };
    const patentes = [...new Set(pendientes.map((s) => s.patente))];
    const vivas = new Set(
      (
        await db
          .select({ patente: suscripcionesOneclick.patente })
          .from(suscripcionesOneclick)
          .where(and(inArray(suscripcionesOneclick.patente, patentes), inArray(suscripcionesOneclick.estado, ["activa", "suspendida"])))
      ).map((r) => r.patente)
    );
    const fichas = new Map((await db.select().from(clientes).where(inArray(clientes.patente, patentes))).map((r) => [r.patente, r]));
    // La más reciente por patente.
    const porPatente = new Map<string, typeof suscripcionesOneclick.$inferSelect>();
    for (const s of pendientes) {
      const t = (x: typeof s) => x.actualizadoEn ?? x.creadoEn;
      const previa = porPatente.get(s.patente);
      if (!previa || t(s) > t(previa)) porPatente.set(s.patente, s);
    }
    for (const s of porPatente.values()) {
      if (vivas.has(s.patente)) continue;
      const row = fichas.get(s.patente);
      const cliente: Cliente = row
        ? clienteFromRow(row)
        : { id: "", nombre: "", patente: s.patente, telefono: s.telefono ?? undefined, email: s.email, creadoEn: s.creadoEn };
      // El teléfono y el correo que puso al inscribir son los más frescos.
      if (s.telefono) cliente.telefono = s.telefono;
      if (s.email) cliente.email = s.email;
      if (row && planStatus(cliente).cls !== "bad") continue;
      const horas = (ahora - new Date(s.actualizadoEn ?? s.creadoEn).getTime()) / 3600_000;
      const linkPago = `https://zplash.cl/pagar?item=${planDeSuscripcion(s.plan) === PLAN_X3 ? "plan_x3" : "plan"}&patente=${encodeURIComponent(s.patente)}`;
      // Solo la espera más larga ya cumplida: la que quedó a medias hace 30 h
      // recibe el aviso de 24 h, no los dos juntos. Las reglas de una misma
      // espera (SMS y correo) salen las dos.
      const esperas = reglas.map((r) => r.condicionDiasAntesVencimiento ?? 0).filter((e) => e <= horas);
      if (!esperas.length) continue;
      const objetivo = Math.max(...esperas);
      for (const regla of reglas) {
        const espera = regla.condicionDiasAntesVencimiento ?? 0;
        if (espera !== objetivo) continue;
        const disparo = await registrarDisparoReglaWhatsapp({
          id: uid(),
          reglaId: regla.id,
          origenTipo: "cliente",
          origenId: `inscripcion:${s.patente}:${espera}`,
          clienteId: row?.id,
          patente: s.patente,
          estado: "programado",
          enviarEn: new Date(ahora).toISOString(),
        });
        if (!disparo) continue;
        try {
          await ejecutarAccionRegla(regla, disparo.id, cliente, undefined, undefined, undefined, undefined, {
            linkPago,
            plan: planDeSuscripcion(s.plan),
          });
          procesados++;
        } catch (error) {
          console.error("Error disparando regla inscripcion_pendiente", regla.id, s.id, error);
          await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
          errores++;
        }
      }
    }
  } catch (error) {
    console.error("Error buscando inscripciones pendientes", error);
    errores++;
  }
  return { procesados, errores };
}
