import "server-only";
import { TransactionDetail } from "transbank-sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { clientes, cobrosOneclick, precios, suscripcionesOneclick } from "@/db/schema";
import { PASES_INCLUIDOS_X5, PLANES, PLAN_ILIMITADO_LEGACY, PLAN_ONECLICK_KEY, finCicloPlan, mesActualKey, planTrasRenovacionSinCliente, precioConCupon, precioConHeredado, precioOneclickDelPlan, requiereValidacionX5, sumarMesesFecha } from "@/lib/helpers";
import { evaluarReglasCorreoPorCobroFallido, evaluarReglasCorreoPorValidacionX5 } from "@/lib/mailing/reglas";
import { oneclickChildCommerceCode, oneclickTransaction } from "@/lib/transbank";
import { evaluarReglasPorCobroFallido } from "@/lib/whatsapp/reglas";
import type { Precios } from "@/types";
import { aplicarPagoAprobado, visitasPeriodoActual } from "./aplicarPagoAprobado";
import { buscarCuponDescuentoPlan } from "./cuponPlan";

/** Próximo ciclo mensual a partir de una fecha base, saltando meses ya
 * vencidos (ej. si el cron no corrió por 2 meses) hasta caer en el futuro.
 * Exportada: cobrarOfertaOneclick la reusa para empujar `proximoCobro` tras
 * un cobro manual (renovación anticipada), con `base = null` para anclar
 * desde hoy en vez de desde el ciclo anterior. */
export function proximoCicloISO(base: string | null): string {
  const hoy = new Date();
  let d = base ? new Date(base) : null;
  // Sin base, el ciclo se cuenta desde hoy con el mismo criterio que un plan
  // recién contratado (ver finCicloPlan): hasta el día anterior del mes que
  // viene, no "hoy + 30".
  if (!d || isNaN(d.getTime())) d = finCicloPlan(hoy);
  while (d <= hoy) d = sumarMesesFecha(d, 1);
  return d.toISOString();
}

type SuscripcionOneclick = typeof suscripcionesOneclick.$inferSelect;

/**
 * Cobra un ciclo de una suscripción Oneclick activa: usado tanto por el cron
 * diario (/api/pagos/oneclick/cobrar) como por el reintento manual desde
 * ClienteInfoModal y por el primer cobro inmediato tras inscribir la
 * tarjeta — misma función, sin distinguir quién la llamó.
 *
 * Siempre avanza `proximoCobro` (aprobado o no): no hay reintento automático
 * por diseño, el cliente queda vencido si falla y un operador decide si
 * reintenta a mano.
 *
 * "pendiente_validacion" es el tercer resultado: no se cobró nada porque el
 * cliente sigue en el ilimitado viejo, no ha aceptado pasar al X5 (ver
 * requiereValidacionX5) y además se pasó del tope — o sea cobrarle le
 * cambiaría el producto. Al que usa poco se le mantiene el plan y SÍ se le
 * cobra (ver el candado más abajo). No es un rechazo de la tarjeta — no se
 * llegó a llamar a Transbank — así que no dispara los avisos de cobro fallido.
 */
export async function cobrarSuscripcion(
  suscripcion: SuscripcionOneclick,
  /**
   * `sinCliente` lo pone SOLO el cron diario (/api/pagos/oneclick/cobrar), que
   * es el único de los cuatro llamadores donde no hay nadie mirando una
   * pantalla. Habilita la política de rescate: al que usa poco se le mantiene
   * el plan en vez de migrarlo al X5 (ver planTrasRenovacionSinCliente).
   *
   * Los otros tres —primer cobro tras inscribir la tarjeta, oferta desde Mi
   * Cuenta y reintento manual del operador— NO lo pasan: ahí el cliente
   * eligió el cambio en pantalla y renovar tiene que migrarlo, como siempre.
   * Además miden mal: el ciclo todavía está corriendo cuando aprietan, así
   * que contar sus pasadas daría un número parcial y un cliente que lava
   * mucho pasaría por uno de bajo uso.
   */
  opciones: { sinCliente?: boolean } = {}
): Promise<{ estado: "aprobada" | "rechazada" | "pendiente_validacion" }> {
  const tbkUser = suscripcion.tbkUser;
  if (!tbkUser) {
    throw new Error("Suscripción sin tbkUser, no se puede cobrar");
  }

  // Todo el ciclo (chequeo de "¿ya se cobró?", el cargo a Transbank y las
  // escrituras posteriores) corre dentro de una sola transacción con un
  // advisory lock por suscripción: el cron diario, un reintento manual desde
  // ClienteInfoModal y el primer cobro inmediato tras inscribir la tarjeta
  // pueden dispararse casi al mismo tiempo para la misma suscripción, y sin
  // este lock los tres podían pasar el chequeo "¿ya aprobado?" antes de que
  // cualquiera terminara de escribir su resultado, cobrando dos veces la
  // misma tarjeta. pg_advisory_xact_lock se libera solo al terminar la
  // transacción (commit o rollback), así que una segunda llamada concurrente
  // espera acá a que la primera termine de verdad antes de mirar el estado.
  const resultado = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${suscripcion.id}))`);

    // Las dos filas que puede necesitar el monto: la del X5 con renovación
    // automática (la de siempre) y la del ilimitado viejo, para el cliente que
    // la política de rescate deja en su plan — ver precioOneclickDelPlan. La
    // del ilimitado normalmente no existe en la tabla y cae al default.
    const filasPrecio = await tx
      .select()
      .from(precios)
      .where(inArray(precios.plan, [PLAN_ONECLICK_KEY, PLAN_ILIMITADO_LEGACY]));
    const preciosMap: Precios = Object.fromEntries(filasPrecio.map((f) => [f.plan, { normal: f.normal, promo: f.promo }]));
    // Precio heredado del cliente (ver precioConHeredado): la renovación
    // automática es justamente pagar antes de vencer, así que el que venía
    // pagando menos no puede subir de precio por inscribir su tarjeta acá —
    // es el caso de los clientes que vienen migrando desde la suscripción de
    // WooCommerce a $19.990.
    const [cliente] = await tx
      .select({
        id: clientes.id,
        precioPlanHeredado: clientes.precioPlanHeredado,
        plan: clientes.plan,
        aceptoX5En: clientes.aceptoX5En,
        // Las dos que periodoPlan necesita para armar el ciclo que se cobra
        // (ver visitasPeriodoActual).
        fechaContratacion: clientes.fechaContratacion,
        vencimiento: clientes.vencimiento,
      })
      .from(clientes)
      .where(eq(clientes.patente, suscripcion.patente))
      .limit(1);

    // Pasadas del ciclo que se está renovando, SOLO en el cobro automático
    // (ver `opciones.sinCliente`). null = hay alguien delante, así que rige la
    // migración de siempre y no se gasta la consulta.
    const pasadasDelCiclo = opciones.sinCliente && cliente ? await visitasPeriodoActual(tx, cliente) : null;
    // Un cobro solo se puede hacer sin firma si NO le cambia el producto al
    // cliente: con alguien delante siempre lo cambia (renovar migra al X5), y
    // en el automático depende de si se pasó del tope.
    const elCobroCambiaElPlan = pasadasDelCiclo === null || pasadasDelCiclo > PASES_INCLUIDOS_X5;

    // Candado del paso al X5: cobrar acá renovaría el plan, y renovar migra al
    // cliente al X5 (ver renovarPlan/aplicarPagoAprobado). Al cliente del
    // ilimitado viejo que todavía no aceptó ese cambio NO se le cobra: este es
    // el único camino de pago sin pantalla, así que es el único donde el
    // cliente no puede enterarse de lo que está comprando. Se pausa la
    // suscripción —el cron solo levanta las "activa", así que no reintenta
    // todos los días— y queda esperando a que el cliente valide por la web o
    // en el mesón, que es lo que vuelve a ponerla activa.
    //
    // Lo que decide es si hay algo que aceptar: al que usa poco, aplicar el
    // pago le MANTIENE su plan (ver elCobroCambiaElPlan), así que no se le está
    // vendiendo ningún cambio y no hay consentimiento que pedirle — se le cobra
    // su plan de siempre. Al que se pasa del tope, o a cualquiera con alguien
    // delante, el pago SÍ lo migraría: ese sigue bloqueado hasta que acepte.
    // El límite tiene que ser el mismo que usa planTrasRenovacionSinCliente o
    // el candado dejaría pasar un cobro que después sí cambia el plan.
    if (cliente && requiereValidacionX5(cliente) && elCobroCambiaElPlan) {
      await tx
        .update(suscripcionesOneclick)
        .set({ estado: "pausada_validacion_x5", actualizadoEn: new Date().toISOString() })
        .where(eq(suscripcionesOneclick.id, suscripcion.id));
      return { estado: "pendiente_validacion" as const, buyOrder: "", monto: 0, clienteId: cliente.id };
    }

    // Con qué plan queda el cliente después de este cobro. Es el mismo cálculo
    // que rehace aplicarPagoAprobado para escribirlo (misma función pura, mismo
    // `plan` y mismas `pasadas` dentro de la misma transacción): acá se necesita
    // antes, porque decide el precio.
    const planQueQueda = pasadasDelCiclo === null ? PLANES[0] : planTrasRenovacionSinCliente(cliente?.plan, pasadasDelCiclo);
    // Al rescatado se le cobra el precio de SU plan, no el del X5: si no le
    // cambiamos el producto, tampoco el precio. El heredado sigue mandando
    // hacia abajo, así que el que venía a 19.990 se queda en 19.990.
    //
    // "Rescatado" exige que TODAVÍA no haya firmado. No alcanza con que el plan
    // siga diciendo ilimitado: el que apretó "Contratar Plan X5" vio un precio
    // en pantalla (19.990, ver precioAutoMensual en /api/pagos/estado) y su
    // ficha puede seguir en el plan viejo porque ese primer cobro lo rechazó
    // la tarjeta — aplicarPagoAprobado nunca corrió. A ese hay que cobrarle lo
    // que firmó, no el precio del plan que arrastra sin querer.
    const rescatado = !!cliente && requiereValidacionX5(cliente) && planQueQueda === PLAN_ILIMITADO_LEGACY;
    const montoLista = precioConHeredado(precioOneclickDelPlan(preciosMap, rescatado ? PLAN_ILIMITADO_LEGACY : PLANES[0]), cliente ?? {});

    // Cupón de descuento atado a la patente: el mismo que ya rebajan Webpay,
    // el mesón y cobrarOfertaOneclick — sin esto la renovación automática era
    // el único camino de cobro que lo ignoraba, y el cliente con descuento
    // veía/pagaba el precio de lista. Se resuelve DENTRO de la transacción,
    // justo antes de autorizar, para que el monto que va a Transbank y el
    // cupón que se quema al aplicar el pago sean el mismo dato (igual que en
    // cobrarOfertaOneclick). Es de un uso: rebaja este cobro (el primero, tras
    // inscribir la tarjeta) y los meses siguientes vuelven al precio de lista.
    const cupon = await buscarCuponDescuentoPlan(suscripcion.patente, tx);
    const montoConCupon = precioConCupon(montoLista, cupon);
    // Transbank no puede cobrar $0 (ver ponytail en precioConCupon): si el
    // descuento cubriera el plan entero se cobra el de lista y el cupón queda
    // sin quemar, para que se lo apliquen en el mesón.
    const aplicaCupon = montoConCupon > 0;
    const monto = aplicaCupon ? montoConCupon : montoLista;

    const buyOrder = "oc" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
    const cicloYm = mesActualKey();
    const commerceCode = oneclickChildCommerceCode();

    // No bloquea reintentos tras un rechazo (pueden existir varias filas
    // "rechazada" el mismo ciclo) — solo evita cobrar dos veces si este ciclo
    // ya tiene una fila "aprobada". Gracias al lock de arriba, para cuando
    // una segunda llamada llega hasta acá la primera ya terminó del todo (no
    // solo insertó su fila de reserva), así que este chequeo ve el resultado
    // real del intento anterior.
    const [yaAprobado] = await tx
      .select({ id: cobrosOneclick.id })
      .from(cobrosOneclick)
      .where(and(eq(cobrosOneclick.suscripcionId, suscripcion.id), eq(cobrosOneclick.cicloYm, cicloYm), eq(cobrosOneclick.estado, "aprobada")))
      .limit(1);
    if (yaAprobado) {
      throw new Error("Este ciclo ya fue cobrado");
    }

    await tx.insert(cobrosOneclick).values({ id: buyOrder, suscripcionId: suscripcion.id, cicloYm, monto, estado: "rechazada" });

    let estado: "aprobada" | "rechazada" = "rechazada";
    let responseCode: number | null = null;
    let authorizationCode: string | null = null;
    let ventaId: string | null = null;

    try {
      const resultado = await oneclickTransaction().authorize(suscripcion.username, tbkUser, buyOrder, [
        new TransactionDetail(monto, commerceCode, buyOrder),
      ]);
      // A diferencia de Webpay Plus, el resultado no trae response_code/
      // authorization_code en la raíz: vienen por cada transacción hija dentro
      // de `details[]` (acá siempre hay una sola, la de ZPlash).
      const detalle = resultado.details?.[0];
      responseCode = detalle?.response_code ?? null;
      authorizationCode = detalle?.authorization_code || null;

      if (detalle?.response_code === 0) {
        estado = "aprobada";
        ventaId = "oc-" + buyOrder;
        try {
          // Savepoint aparte: si esto falla, Transbank ya cobró la tarjeta,
          // así que NO puede perderse el registro de que el ciclo quedó
          // "aprobada" (eso volvería a cobrar el mismo mes en el próximo
          // intento) — solo se revierte la extensión de vencimiento/venta a
          // medio aplicar, y se deja ventaId en null para que quede marcado
          // para revisión manual en vez de simular una venta que no cuadra.
          await tx.transaction(async (tx2) => {
            await aplicarPagoAprobado(
              {
                patente: suscripcion.patente,
                monto,
                ventaId: ventaId as string,
                metodoPago: "tarjeta",
                creadoPor: "Automático (Oneclick)",
                esServicioAdicional: false,
                tipoVentaNuevo: "Renovación automática (Oneclick)",
                tipoVentaExistente: "Renovación automática (Oneclick)",
                // El correo con que se inscribió la tarjeta: si este cobro crea
                // la ficha (primer cobro de una patente nueva), queda de contacto.
                email: suscripcion.email,
                cuponCodigo: aplicaCupon ? cupon?.codigo : undefined,
                // Solo en el automático: ahí el plan sale de la política de
                // rescate en vez de migrar a ciegas al X5. undefined en los
                // tres caminos con el cliente delante.
                pasadasDelCicloSinCliente: pasadasDelCiclo ?? undefined,
              },
              tx2
            );
          });
        } catch (errorAplicar) {
          console.error(
            "Pago Oneclick aprobado por Transbank pero no se pudo aplicar en la base (cliente sin extender/venta) — requiere revisión manual",
            suscripcion.id,
            buyOrder,
            errorAplicar
          );
          ventaId = null;
        }
      }
    } catch (error) {
      console.error("Error autorizando cobro Oneclick", suscripcion.id, error);
      estado = "rechazada";
    }

    await tx
      .update(cobrosOneclick)
      .set({ estado, responseCode, authorizationCode, ventaId })
      .where(eq(cobrosOneclick.id, buyOrder));

    await tx
      .update(suscripcionesOneclick)
      .set({
        proximoCobro: proximoCicloISO(suscripcion.proximoCobro),
        actualizadoEn: new Date().toISOString(),
        // Si venía pausada por el candado y este cobro igual salió (política de
        // rescate: no le cambia el plan), la pausa ya no describe nada — no se
        // está esperando ningún sí. Sin esto la suscripción se cobraba todos los
        // meses mientras Mi Cuenta le mostraba "En pausa" al cliente y el
        // operador no tenía botón para suspenderla (ClienteInfoModal no dibuja
        // acciones para ese estado). La rama que despausa en el cron no alcanza:
        // exige !requiereValidacionX5, que para estos clientes sigue siendo true.
        ...(suscripcion.estado === "pausada_validacion_x5" ? { estado: "activa" } : {}),
      })
      .where(eq(suscripcionesOneclick.id, suscripcion.id));

    return { estado, buyOrder, monto, clienteId: cliente?.id ?? null };
  });

  // Fuera de la transacción/lock a propósito (avisar por WhatsApp no debe
  // retrasar la liberación del advisory lock). `buyOrder` es el id de la fila
  // en cobrosOneclick — sirve de origenId para no avisar dos veces por el
  // mismo intento de cobro (ver evaluarReglasPorCobroFallido). after() en vez
  // de un `.catch()` suelto: garantiza que Vercel mantenga la función viva
  // hasta que termine el envío, en vez de arriesgarse a que se congele a
  // medio camino y el disparo quede pegado en "programado" para siempre.
  // El cliente se resuelve por patente dentro de la transacción, no por
  // `suscripcion.clienteId`: esa columna nunca se llena al inscribir (la
  // tarjeta se inscribe antes de que exista necesariamente la ficha, ver
  // listarSuscripcionesOneclick), así que mientras esto miraba clienteId el
  // aviso de cobro rechazado no salía NUNCA — ni por WhatsApp ni por correo.
  const clienteId = resultado.clienteId ?? suscripcion.clienteId;
  if (resultado.estado === "rechazada" && clienteId) {
    after(() =>
      evaluarReglasPorCobroFallido({
        clienteId,
        patente: suscripcion.patente,
        buyOrderId: resultado.buyOrder,
        monto: resultado.monto,
      }).catch((error) => console.error("Error evaluando reglas de WhatsApp por cobro fallido", suscripcion.id, error))
    );
    after(() =>
      evaluarReglasCorreoPorCobroFallido({
        clienteId,
        patente: suscripcion.patente,
        buyOrderId: resultado.buyOrder,
        monto: resultado.monto,
      }).catch((error) => console.error("Error evaluando reglas de correo por cobro fallido", suscripcion.id, error))
    );
  }

  // Mismo aviso, otro motivo: acá la tarjeta está bien y no hay nada que
  // arreglar salvo aceptar el X5, así que va por su propio evento y no por
  // las reglas de cobro fallido (ver evaluarReglasCorreoPorValidacionX5).
  // Solo correo: los templates de WhatsApp los tiene que aprobar Meta antes.
  if (resultado.estado === "pendiente_validacion" && clienteId) {
    after(() =>
      evaluarReglasCorreoPorValidacionX5({
        clienteId,
        patente: suscripcion.patente,
        suscripcionId: suscripcion.id,
        cicloYm: mesActualKey(),
      }).catch((error) => console.error("Error evaluando reglas de correo por validación X5 pendiente", suscripcion.id, error))
    );
  }

  return { estado: resultado.estado };
}
