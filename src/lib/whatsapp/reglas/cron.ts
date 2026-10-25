import "server-only";

import { and, eq, gt, gte, isNotNull, lt, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, ingresos, ventas } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import {
  listarDisparosProgramadosVencidos,
  listarReglasWhatsappActivas,
  marcarDisparoReglaWhatsapp,
  obtenerReglaWhatsapp,
  registrarDisparoReglaWhatsapp,
  tomarDisparoProgramado,
} from "@/lib/dataAccess/whatsapp";
import { periodoPlan, planStatus, planVigente, uid } from "@/lib/helpers";
import { patentesConAutopago } from "@/lib/mailing/reglas/cron";
import { LOTE_TICKET_REACTIVACION } from "@/lib/pagos/ticketReactivacion";
import { buscarCliente, ejecutarAccionRegla, LOTE_CUPON_SIN_VISITA, MS_POR_DIA } from "./motor";
import type { DisparoReglaWhatsapp, ReglaWhatsapp } from "@/types";

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
      await ejecutarAccionRegla(regla, disparo.id, cliente, monto);
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

  const sinVisita = await procesarSinVisita(ahoraISO);
  const porVencer = await procesarCuponesPorVencer(ahoraISO);
  return {
    procesados: procesados + sinVisita.procesados + porVencer.procesados,
    errores: errores + sinVisita.errores + porVencer.errores,
  };
}

// Días de margen para "sin_visita": si el cron no corre un día, el cliente
// que cumplió N días ayer igual entra hoy. El origenId evita el doble envío.
const DIAS_VENTANA_SIN_VISITA = 3;

// "sin_visita": cliente que lleva N días (condicionDiasAntesVencimiento) sin
// pasar por el túnel y no tiene plan vigente — al de plan vigente no se le
// recuerda que no viene (cree que le van a cortar el plan). Una regla por
// cada umbral (ej. 18, 30, 45 y 65 días). origenId con la fecha de la última
// visita y los días: si vuelve, la cuenta empieza de nuevo.
async function procesarSinVisita(ahoraISO: string): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  let reglas: ReglaWhatsapp[] = [];
  try {
    reglas = await listarReglasWhatsappActivas("sin_visita");
  } catch (error) {
    console.error("Error cargando reglas WhatsApp (sin_visita)", error);
  }
  for (const regla of reglas) {
    const dias = regla.condicionDiasAntesVencimiento ?? 0;
    if (dias <= 0) continue;
    const hasta = new Date(Date.now() - dias * MS_POR_DIA).toISOString();
    const desde = new Date(Date.now() - (dias + DIAS_VENTANA_SIN_VISITA) * MS_POR_DIA).toISOString();
    let filas: (typeof clientes.$inferSelect)[];
    try {
      filas = await getDb()
        .select()
        .from(clientes)
        .where(and(isNotNull(clientes.ultimaVisita), gt(clientes.ultimaVisita, desde), lte(clientes.ultimaVisita, hasta)));
    } catch (error) {
      console.error("Error buscando clientes sin visita", regla.id, error);
      errores++;
      continue;
    }

    for (const row of filas) {
      // Mismo criterio que el mesón (incluye el último día y la espera de Woo).
      if (row.vencimiento && planStatus(clienteFromRow(row)).label !== "Vencido") continue;
      const disparo = await registrarDisparoReglaWhatsapp({
        id: uid(),
        reglaId: regla.id,
        origenTipo: "cliente",
        origenId: `${row.id}:${row.ultimaVisita}:${dias}`,
        clienteId: row.id,
        patente: row.patente ?? undefined,
        estado: "programado",
        enviarEn: ahoraISO,
      });
      if (!disparo) continue;
      try {
        await ejecutarAccionRegla(regla, disparo.id, clienteFromRow(row));
        procesados++;
      } catch (error) {
        console.error("Error disparando regla WhatsApp sin_visita", regla.id, row.id, error);
        await marcarDisparoReglaWhatsapp(disparo.id, { estado: "error" }).catch(() => {});
        errores++;
      }
    }
  }
  return { procesados, errores };
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
