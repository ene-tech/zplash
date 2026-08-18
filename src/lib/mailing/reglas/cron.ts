import "server-only";

import { and, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, suscripcionesOneclick } from "@/db/schema";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { listarReglasCorreoActivas, obtenerPlantillaCorreo, registrarDisparoReglaCorreo } from "@/lib/dataAccess/mail";
import { calcularOfertasPlanDeCliente } from "@/lib/dataAccess/ofertasPlan";
import { uid } from "@/lib/helpers";
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
  const patentesConAutopago = new Set(
    (await db.select({ patente: suscripcionesOneclick.patente }).from(suscripcionesOneclick).where(eq(suscripcionesOneclick.estado, "activa"))).map(
      (r) => r.patente
    )
  );

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
      calcular: (row: typeof clientes.$inferSelect) => Promise<number | undefined>;
      campo: "precioReactivacion" | "precioRenovacion";
      obligatorio: boolean;
    }
  ) {
    for (const row of rows) {
      if (regla.condicionPlanes?.length && (!row.plan || !regla.condicionPlanes.includes(row.plan))) continue;
      // Cliente con tarjeta inscrita: el aviso de vencimiento es ruido
      // (Oneclick lo va a renovar solo). Sin mirar el origen — Mi Cuenta →
      // "Mis tarjetas" inscribe por patente, un cliente LOCAL también puede
      // tener cobro automático. Ver comentario del campo en
      // @/db/schema/mailReglas.
      if (regla.condicionSoloSinAutopago && row.patente && patentesConAutopago.has(row.patente)) continue;

      let precioPromo: number | undefined;
      if (promo) {
        // Antes de este `promo` (v1: solo plan_vencido), nada en este loop
        // podía lanzar antes de registrar el disparo. calcularOfertasPlanDeCliente
        // hace 4 consultas por cliente — un error transitorio de un cliente no
        // puede tumbar el resto del loop (ni, más grave, el bloque plan_vencido
        // completo que corre después en la misma llamada del cron).
        try {
          precioPromo = await promo.calcular(row);
        } catch (error) {
          console.error("Error calculando precio de promoción para regla de correo de vencimiento", regla.id, row.id, error);
          errores++;
          continue;
        }
        if (precioPromo === undefined && promo.obligatorio) continue;
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
        const variables = construirVariables({ cliente, ...(promo ? { [promo.campo]: precioPromo } : {}) });
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
    const calcularPrecioRenovacion = async (row: typeof clientes.$inferSelect): Promise<number | undefined> => {
      const oferta = (await calcularOfertasPlanDeCliente(clienteFromRow(row))).renovacionAnticipada;
      // tramoVigente, no solo ahorro>0: sin él, un plan sin ningún tramo de
      // renovación anticipada configurado para el canal Web cae al precio
      // preferencial general (Precios[plan].promo, ver precioRenovacionLocal)
      // y eso cuenta como "promoción real" para cualquier cliente — la regla
      // "solo con promoción vigente" no excluiría a nadie, y si ese precio
      // legado quedó en $0 el correo saldría anunciando una renovación gratis.
      return oferta && oferta.tramoVigente && oferta.ahorro > 0 ? oferta.pPromo : undefined;
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
    const calcularPrecioReactivacion = async (row: typeof clientes.$inferSelect): Promise<number | undefined> =>
      (await calcularOfertasPlanDeCliente(clienteFromRow(row))).reactivacion?.precio;

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
