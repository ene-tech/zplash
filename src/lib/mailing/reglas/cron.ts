import "server-only";

import { and, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, ingresos, precios, suscripcionesOneclick } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { preciosFromRows } from "@/lib/dataAccess/precios";
import { listarReglasCorreoActivas, obtenerPlantillaCorreo, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { ofertaConCupon } from "@/lib/helpers/ofertasPlan";
import { buscarCuponDescuentoPlan } from "@/lib/pagos/cuponPlan";
import { montoDescuento, periodoPlan, planVigente, precioRenovacionATiempo, uid } from "@/lib/helpers";
import { construirVariables, ejecutarAccionReglaCorreo, MS_POR_DIA } from "./motor";
import type { ReglaCorreo } from "@/types";

// Cuánto atrás se sigue considerando "recién vencido" para tipoEvento
// "plan_vencido" (contado desde el punto de corte de cada regla, ver
// condicionDiasDespuesVencimiento más abajo) — sin este tope, un cliente
// vencido hace meses (que nunca renovó) recibiría el aviso cada vez que el
// cron corre y encuentra la regla sin un disparo previo... salvo que ya
// tiene uno, porque el origenId incluye el vencimiento exacto (ver más
// abajo) y no cambia. El tope real contra reenvíos es ese origenId; esta
// ventana es solo para no barrer la tabla completa de clientes vencidos
// históricos cada vez que se activa una regla nueva (o una con delay alto,
// ej. condicionDiasDespuesVencimiento=3, el día que el cron no corrió).
const DIAS_VENTANA_PLAN_VENCIDO = 3;

/**
 * Llamado por el cron diario (/api/correo/reglas/evaluar): evalúa reglas
 * "plan_proximo_vencer" (mismo query que procesarPendientesYVencimientos de
 * WhatsApp, ver @/lib/whatsapp/reglas/cron) y "plan_vencido" (nuevo: sin
 * equivalente en WhatsApp hoy). Sin cola de "pendientes programados" con
 * delay — a diferencia del cron de WhatsApp, la v1 de correo solo dispara
 * inmediato (delayDias=0 en venta_creada/cobro_fallido, ver disparadores.ts).
 */
export async function procesarVencimientosCorreo(): Promise<{ procesados: number; errores: number }> {
  let procesados = 0;
  let errores = 0;
  const ahoraISO = new Date().toISOString();
  const db = getDb();

  // Para condicionSoloSinAutopago (ver comentario en @/db/schema/mailReglas)
  // — se calcula una sola vez acá afuera porque es la misma consulta para
  // cualquier regla que la tenga marcada, y hoy son pocas filas (cobro
  // automático recién está migrando desde WooCommerce).
  //
  // Cuenta LOS DOS cobros automáticos, no solo el propio: al cliente que sigue
  // en WooCommerce (renovacionAutoWooDesde) también se le renueva solo, así que
  // el aviso de vencimiento le sobra igual. Mirar únicamente suscripcionesOneclick
  // era inofensivo mientras el staging site lock tenía a WooCommerce sin cobrar
  // (ago-2026), pero desde que se destrabó vuelve a renovar de verdad: sin esto,
  // 46 clientes que WooCommerce va a cobrar igual reciben un "tu plan vence".
  const [conOneclick, conWoo] = await Promise.all([
    db.select({ patente: suscripcionesOneclick.patente }).from(suscripcionesOneclick).where(eq(suscripcionesOneclick.estado, "activa")),
    db.select({ patente: clientes.patente }).from(clientes).where(isNotNull(clientes.renovacionAutoWooDesde)),
  ]);
  const patentesConAutopago = new Set([...conOneclick, ...conWoo].map((r) => r.patente));

  // Una sola lectura para toda la corrida: los precios son una tabla de ~5
  // filas y no cambian entre cliente y cliente (ver {{precioX5}} más abajo).
  const preciosVigentes = preciosFromRows(await db.select().from(precios));

  async function dispararParaClientes(
    regla: ReglaCorreo,
    rows: (typeof clientes.$inferSelect)[],
    // Precio de la promoción que se anuncia en el correo, calculado para ESE
    // cliente puntual (depende de sus días vencido / pasadas, no es un valor
    // fijo por regla) y expuesto a la plantilla como {{precioReactivacion}} o
    // {{precioRenovacion}} según `campo`. `undefined` = ningún tramo le calza:
    // con `obligatorio` se salta el cliente ANTES de registrar el disparo, para
    // que el cron de mañana lo vuelva a evaluar en vez de darlo por "ya
    // enviado" (ver precioReactivacionVencido/precioRenovacionLocal en
    // @/lib/helpers/precios).
    promo?: {
      calcular: (row: typeof clientes.$inferSelect) => Promise<{ precio: number | undefined; pasadas?: number; descuento?: number }>;
      campo: "precioReactivacion" | "precioRenovacion";
      obligatorio: boolean;
    }
  ) {
    for (const row of rows) {
      // planVigente y no `row.plan` a secas: al cliente que viene del ilimitado
      // viejo la renovación le deja `plan` en "Plan X5" pero le conserva el mes
      // sin tope que ya había pagado (ver ilimitadoHastaAlRenovar), así que la
      // columna dice X5 mientras el plan que de verdad está usando es el
      // ilimitado. Filtrar por la columna dejaba fuera justo a esa gente, que
      // es a la que hay que avisarle que su plan se termina.
      if (
        regla.condicionPlanes?.length &&
        !regla.condicionPlanes.includes(planVigente({ plan: row.plan ?? undefined, ilimitadoHasta: row.ilimitadoHasta ?? undefined }))
      )
        continue;
      // Cliente con tarjeta inscrita: el aviso de vencimiento es ruido
      // (Oneclick lo va a renovar solo). Sin mirar el origen — Mi Cuenta →
      // "Mis tarjetas" inscribe por patente, un cliente LOCAL también puede
      // tener cobro automático. Ver comentario del campo en
      // @/db/schema/mailReglas.
      if (regla.condicionSoloSinAutopago && row.patente && patentesConAutopago.has(row.patente)) continue;

      // Mínimo de pasadas del ciclo EN CURSO (ver condicionPasadasMin en
      // @/db/schema/mailReglas). Se cuenta acá y no en el bloque `promo` de más
      // abajo porque aquel usa otro contador —visitasUltimoPeriodoVencido, el
      // del período que ya se venció— y solo corre para "plan_vencido".
      //
      // Va antes de registrarDisparoReglaCorreo, igual que los otros filtros:
      // al cliente que hoy no llega al mínimo no se le anota un disparo, así
      // que mañana, con una pasada más, vuelve a ser elegible.
      //
      // ponytail: una consulta por cliente, como en
      // evaluarReglasCorreoPorTopeIlimitado. Corre una vez al día y solo sobre
      // los que vencen dentro de la ventana (~200); si algún día pesa, se
      // reemplaza por un group by contra `ingresos` para todo el lote.
      if (regla.condicionPasadasMin != null) {
        const { inicio, fin } = periodoPlan(clienteFromRow(row));
        const pasadas = (
          await db
            .select({ id: ingresos.id })
            .from(ingresos)
            .where(and(eq(ingresos.clienteId, row.id), gte(ingresos.fecha, inicio.toISOString()), lt(ingresos.fecha, fin.toISOString())))
        ).length;
        if (pasadas < regla.condicionPasadasMin) continue;
      }

      let valores: { precio: number | undefined; pasadas?: number; descuento?: number } = { precio: undefined };
      if (promo) {
        // Antes de este `promo` (v1: solo plan_vencido), nada en este loop
        // podía lanzar antes de registrar el disparo. calcularOfertasPlanDeCliente
        // hace 4 consultas por cliente — un error transitorio de un cliente no
        // puede tumbar el resto del loop (ni, más grave, el bloque plan_vencido
        // completo que corre después en la misma llamada del cron).
        try {
          valores = await promo.calcular(row);
        } catch (error) {
          console.error("Error calculando precio de promoción para regla de correo de vencimiento", regla.id, row.id, error);
          errores++;
          continue;
        }
        if (valores.precio === undefined && promo.obligatorio) continue;
        // Tope de pasadas de la regla (ver condicionPasadasMax en
        // @/db/schema/mailReglas). Va antes de registrarDisparoReglaCorreo,
        // igual que el `obligatorio` de arriba: al cliente que no pasa el
        // filtro no se le anota un disparo, asi que si mañana la regla cambia
        // de tope vuelve a ser elegible en vez de quedar marcado como "ya
        // enviado".
        if (regla.condicionPasadasMax != null && (valores.pasadas ?? 0) > regla.condicionPasadasMax) continue;
      }

      // origenId incluye el vencimiento exacto: si el cliente renueva y su
      // vencimiento cambia, vuelve a ser elegible para esta misma regla en el
      // ciclo nuevo en vez de quedar bloqueado para siempre por el histórico
      // (mismo mecanismo que plan_proximo_vencer de WhatsApp).
      const disparo = await registrarDisparoReglaCorreo({
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
        const cliente = clienteFromRow(row);
        // {{montoDescuento}} = la plata del cupón que la patente tiene
        // disponible; {{montoAPagar}} = lo que queda por pagar con ese cupón ya
        // restado, o sea el mismo número de {{precioReactivacion}} con el
        // nombre que ya usan las plantillas de WhatsApp (ver
        // construirVariables en @/lib/whatsapp/reglas/motor).
        //
        // SOLO en la reactivación: calcularPrecioRenovacion no pasa por
        // ofertaConCupon, así que en "plan_proximo_vencer" el precio va sin el
        // cupón restado —anuncia más de lo que Mi Cuenta muestra y Webpay
        // cobra— y llamar a eso "monto a pagar" sería mentira. Ahí las dos
        // variables quedan vacías a propósito.
        const variables = construirVariables({
          cliente,
          // {{precioX5}}: lo que le cuesta HOY contratar el plan que sí se
          // vende, con su precio heredado aplicado (ver precioRenovacionATiempo,
          // que además traduce "Plan Ilimitado Mensual" a Plan X5 vía
          // planVendible). Va a todas las reglas de vencimiento, no solo a la
          // del fin del ilimitado: es el mismo número que le mostraría Mi
          // Cuenta, así que ninguna plantilla puede anunciar uno distinto.
          precioX5: precioRenovacionATiempo(preciosVigentes, cliente.plan || "", cliente),
          ...(promo
            ? {
                [promo.campo]: valores.precio,
                pasadas: valores.pasadas,
                ...(promo.campo === "precioReactivacion" ? { montoDescuento: valores.descuento, montoAPagar: valores.precio } : {}),
              }
            : {}),
        });
        await ejecutarAccionReglaCorreo(regla, disparo.id, cliente, variables);
        procesados++;
      } catch (error) {
        console.error("Error disparando regla de correo de vencimiento", regla.id, row.id, error);
        errores++;
      }
    }
  }

  let reglasPorVencer: ReglaCorreo[] = [];
  try {
    reglasPorVencer = await listarReglasCorreoActivas("plan_proximo_vencer");
  } catch (error) {
    console.error("Error cargando reglas de correo (plan_proximo_vencer)", error);
  }
  if (reglasPorVencer.length) {
    // Precio de renovación anticipada preferencial del cliente por el canal
    // WEB (el correo enlaza a Mi Cuenta, ver el botón "Ir a Mi Cuenta" en
    // @/lib/mailing/plantillaBase): es la invitación a renovar online antes de
    // que se le venza el plan, así que un tramo marcado "Solo Local" no se
    // anuncia acá. `undefined` cuando no hay promoción real que ofrecer —
    // porque ningún tramo le calza (típicamente viene mucho) o porque el
    // precio no le ahorra nada contra el normal — y con
    // condicionSoloConPromoRenovacion ese cliente no recibe el correo.
    const calcularPrecioRenovacion = async (row: typeof clientes.$inferSelect): Promise<{ precio: number | undefined }> => {
      const oferta = (await calcularOfertasPlanDeCliente(clienteFromRow(row))).renovacionAnticipada;
      // tramoVigente, no solo ahorro>0: sin él, un plan sin ningún tramo de
      // renovación anticipada configurado para el canal Web cae al precio
      // preferencial general (Precios[plan].promo, ver precioRenovacionLocal)
      // y eso cuenta como "promoción real" para cualquier cliente — la regla
      // "solo con promoción vigente" no excluiría a nadie, y si ese precio
      // legado quedó en $0 el correo saldría anunciando una renovación gratis.
      return { precio: oferta && oferta.tramoVigente && oferta.ahorro > 0 ? oferta.pPromo : undefined };
    };

    for (const regla of reglasPorVencer) {
      const dias = regla.condicionDiasAntesVencimiento ?? 0;
      const hastaISO = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
      const rows = await db
        .select()
        .from(clientes)
        .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, ahoraISO), lte(clientes.vencimiento, hastaISO)));
      // Calcular la promoción cuesta cuatro consultas POR CLIENTE
      // (calcularOfertasPlanDeCliente), así que solo se hace cuando la regla
      // de verdad la usa: porque filtra por ella o porque su plantilla
      // menciona la variable. Un recordatorio de vencimiento común y
      // corriente sigue costando lo mismo que antes.
      const plantilla = await obtenerPlantillaCorreo(regla.plantillaCorreoId);
      const usaVariable = !!plantilla && `${plantilla.asunto} ${plantilla.cuerpo}`.includes("{{precioRenovacion}}");
      const necesitaPromo = usaVariable || !!regla.condicionSoloConPromoRenovacion;
      await dispararParaClientes(
        regla,
        rows,
        necesitaPromo
          ? { calcular: calcularPrecioRenovacion, campo: "precioRenovacion", obligatorio: !!regla.condicionSoloConPromoRenovacion }
          : undefined
      );
    }
  }

  let reglasVencidos: ReglaCorreo[] = [];
  try {
    reglasVencidos = await listarReglasCorreoActivas("plan_vencido");
  } catch (error) {
    console.error("Error cargando reglas de correo (plan_vencido)", error);
  }
  if (reglasVencidos.length) {
    // Mismo cálculo que usa Operador/Mi Cuenta (oferta.reactivacion) — ver
    // calcularOfertasPlanDeCliente, que ya trae ventas/ingresos/config/precios
    // de este cliente puntual, un solo lugar para no duplicar esa lógica acá.
    const calcularPrecioReactivacion = async (
      row: typeof clientes.$inferSelect
    ): Promise<{ precio: number | undefined; pasadas?: number; descuento?: number }> => {
      // Con el cupón de descuento de la patente ya restado, igual que Mi
      // Cuenta (ver ofertaConCupon): el correo tiene que anunciar el mismo
      // número que después cobra Webpay/Oneclick. Solo para mostrar — esta
      // oferta no alimenta ningún camino de cobro.
      const sinCupon = await calcularOfertasPlanDeCliente(clienteFromRow(row));
      const cupon = await buscarCuponDescuentoPlan(row.patente);
      const oferta = ofertaConCupon(sinCupon, cupon).reactivacion;
      // {{pasadas}} = las veces que alcanzó a pasar en el período que pagó, el
      // mismo número con que el tramo le eligió el precio. Va tal cual, sin
      // topar: es el dato con que el correo argumenta, y mostrarle un número
      // distinto del que realmente pasó le resta credibilidad al mensaje. Es
      // además el mismo valor contra el que filtra condicionPasadasMax.
      // El descuento se mide contra el precio de reactivación SIN cupón: para
      // un cupón de porcentaje "cuánta plata tiene disponible" no es su
      // `valor`, depende de esa base (ver montoDescuento en
      // @/lib/helpers/cupones). Topado a esa base igual que precioConCupon
      // topa el precio en $0: si no, un cupón más grande que el plan anuncia
      // "$25.000 de descuento, a pagar $0" e inventa un precio de lista que no
      // existe.
      return {
        precio: oferta?.precio,
        pasadas: oferta?.visitas,
        descuento:
          cupon && sinCupon.reactivacion
            ? Math.min(sinCupon.reactivacion.precio, montoDescuento(cupon, sinCupon.reactivacion.precio))
            : undefined,
      };
    };

    // Query por regla (no una sola para todas) porque cada una puede tener su
    // propio condicionDiasDespuesVencimiento — ej. una regla a los 0 días
    // (recordatorio inmediato) y otra a los 3 días (para darle tiempo a un
    // reintento de cobro automático antes de avisar) — así que la ventana
    // [desde, hasta) se corre hacia atrás según ese delay.
    for (const regla of reglasVencidos) {
      const diasDespues = regla.condicionDiasDespuesVencimiento ?? 0;
      const hastaISO = new Date(Date.now() - diasDespues * MS_POR_DIA).toISOString();
      const desdeISO = new Date(Date.now() - (diasDespues + DIAS_VENTANA_PLAN_VENCIDO) * MS_POR_DIA).toISOString();
      const rows = await db
        .select()
        .from(clientes)
        .where(and(isNotNull(clientes.vencimiento), gte(clientes.vencimiento, desdeISO), lt(clientes.vencimiento, hastaISO)));
      await dispararParaClientes(regla, rows, {
        calcular: calcularPrecioReactivacion,
        campo: "precioReactivacion",
        // Sin tramo de reactivación que le calce no hay nada que ofrecerle:
        // esta promoción no tiene precio de respaldo, así que el correo no
        // sale (a diferencia de la renovación anticipada, que es opt-in por
        // regla vía condicionSoloConPromoRenovacion).
        obligatorio: true,
      });
    }
  }

  return { procesados, errores };
}
