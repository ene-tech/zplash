import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { after } from "next/server";
import { getDb, type DbOrTx } from "@/db";
import { clientes, ingresos, movimientosContables, suscripcionesOneclick, ventas } from "@/db/schema";
import { clienteFromRow, movimientoToRow } from "@/lib/dataAccess";
import { consumirCupon } from "./cuponPlan";
import {
  PLANES,
  diaEnSantiago,
  ilimitadoHastaAlRenovar,
  periodoPlan,
  movimientoContableDesdeVenta,
  resolverPatentePendiente,
  sigueVigenteHoy,
  sumarMesesFecha,
  uid,
  vencimientoAnclado,
  cicloPlanDesde,
  vencimientoPorDefectoISO,
} from "@/lib/helpers";
import { evaluarReglasCorreoPorVenta } from "@/lib/mailing/reglas";
import { evaluarReglasPorCambioPatente, evaluarReglasPorVenta } from "@/lib/whatsapp/reglas";
import type { Cliente, Venta } from "@/types";


/** Pasadas del cliente en el ciclo de plan que se está renovando, contadas en
 * la base (acá no hay un AppData cargado como en el módulo Operador). Solo se
 * usa en el webhook de WooCommerce, para no tocarle el plan al cliente que no
 * pasó ni una vez (ver planResultante en /api/webhooks/woocommerce).
 *
 * El período que interesa es el que CONTIENE el vencimiento viejo, no el que
 * corre hoy: el webhook llega justo cuando el ciclo acaba de rotar (o días
 * después, si el cobro se atrasó), así que contar desde hoy da siempre 0 y
 * todo cliente parecería no haber venido nunca. */
export async function visitasPeriodoActual(db: DbOrTx, cliente: { id: string; fechaContratacion: string | null; vencimiento: string | null }): Promise<number> {
  const { inicio, fin } = periodoPlan(cliente, (cliente.vencimiento && diaEnSantiago(cliente.vencimiento)) || new Date());
  const filas = await db
    .select({ id: ingresos.id })
    .from(ingresos)
    .where(
      and(
        eq(ingresos.clienteId, cliente.id),
        gte(ingresos.fecha, inicio.toISOString()),
        lt(ingresos.fecha, fin.toISOString())
      )
    );
  return filas.length;
}

interface AplicarPagoParams {
  patente: string;
  monto: number;
  ventaId: string;
  metodoPago: string;
  creadoPor: string;
  esServicioAdicional: boolean;
  // Si es servicio adicional no se toca plan/vencimiento del cliente; si no,
  // se extiende (o inicia) el ciclo mensual como cualquier renovación web.
  tipoVentaNuevo: string;
  tipoVentaExistente: string;
  // true solo en la reactivación promocional de un plan vencido: el ciclo
  // arranca de nuevo hoy y el cliente recibe el mes completo que le anuncia la
  // tarjeta ("precio promocional solo por este primer mes"), en vez de saltar
  // al próximo aniversario de su contratación —que puede caer en dos días—.
  // Mismo criterio que el mesón, ver `anclarAtraso` en renovarPlan.
  reiniciarCiclo?: boolean;
  // Boleta/Factura elegida en el checkout (ver DatosDocumento en
  // usePagarForm) — snapshot al momento del pago, igual que ya hace
  // aplicarPagoPackEmpresa con estas mismas columnas de `ventas`.
  tipoDocumento?: string | null;
  razonSocial?: string | null;
  rut?: string | null;
  direccion?: string | null;
  giro?: string | null;
  email?: string | null;
  // Cupón de descuento ya aplicado a `monto` por quien resolvió el precio (ver
  // buscarCuponDescuentoPlan): acá solo se sella la venta y se quema el cupón,
  // en esta misma transacción — nunca se vuelve a calcular el descuento, que a
  // esta altura Transbank ya cobró el monto rebajado.
  cuponCodigo?: string | null;
}

/**
 * Buscar/crear cliente por patente + insertar venta, para un pago que un
 * proveedor externo (Transbank) ya confirmó como aprobado. Compartido entre
 * webpay/retorno y los dos flujos de Oneclick — mismo patrón que ya usaba el
 * webhook de WooCommerce, factorizado acá porque ya son tres sitios
 * repitiendo la misma lógica.
 *
 * Recibe `db` (una conexión normal o una transacción/savepoint del llamador,
 * ver DbOrTx en @/db) en vez de abrir la suya propia: la extensión del
 * vencimiento del cliente y el insert de la venta son dos escrituras
 * separadas, así que si el llamador no las envuelve en una transacción, una
 * falla a mitad de camino puede dejar al cliente con el plan extendido sin
 * que exista la venta que lo respalda (y un reintento del mismo pago lo
 * extendería de nuevo, gratis). Los tres llamadores (webpay/retorno,
 * cobrarSuscripcion x2) ahora pasan su propia transacción.
 */
/** Dispara las reglas de WhatsApp y de correo de una venta confirmada por un
 * pago externo, pero SOLO si la venta sobrevivió a la transacción del
 * llamador. Devuelve false cuando decidió no avisar.
 *
 * Existe como función aparte para poder probar ese guard sin montar toda la
 * transacción de aplicarPagoAprobado — ver aplicarPagoAprobado.test.ts. */
export async function evaluarReglasSiLaVentaPersistio(
  venta: Venta,
  cambio?: { cliente: Cliente; patenteAnterior: string }
): Promise<boolean> {
  const [persistida] = await getDb().select({ id: ventas.id }).from(ventas).where(eq(ventas.id, venta.id)).limit(1);
  if (!persistida) {
    console.error("Venta revertida después de aplicar el pago: no se avisa nada al cliente", venta.id, venta.patente);
    return false;
  }
  await Promise.all([
    evaluarReglasPorVenta([venta]).catch((error) => console.error("Error evaluando reglas de WhatsApp por venta (pago externo)", error)),
    evaluarReglasCorreoPorVenta([venta]).catch((error) => console.error("Error evaluando reglas de correo por venta (pago externo)", error)),
    cambio
      ? evaluarReglasPorCambioPatente(cambio.cliente, cambio.patenteAnterior).catch((error) =>
          console.error("Error evaluando reglas de WhatsApp por cambio de patente (pago externo)", error)
        )
      : null,
  ]);
  return true;
}

export async function aplicarPagoAprobado(
  p: AplicarPagoParams,
  db: DbOrTx = getDb()
): Promise<{ clienteId: string; vencimiento: string | null }> {
  const [existente] = await db.select().from(clientes).where(eq(clientes.patente, p.patente)).limit(1);

  let clienteId: string;
  // Vencimiento resultante tras aplicar este pago — devuelto para que
  // cobrarOfertaOneclick pueda anclar `suscripcionesOneclick.proximoCobro` al
  // vencimiento REAL en vez de a un "hoy + un mes" a ciegas (ver ese
  // comentario en cobrarOfertaOneclick.ts para el desfase que esto evita).
  // Por defecto queda en lo que ya tenía `existente` (ej. rama
  // esServicioAdicional, que no toca vencimiento); las otras dos ramas lo
  // reasignan a lo que efectivamente escriben.
  let vencimientoResultante: string | null = existente?.vencimiento ?? null;
  let cambioPatente: { cliente: Cliente; patenteAnterior: string } | undefined;
  if (p.esServicioAdicional) {
    if (existente) {
      clienteId = existente.id;
    } else {
      clienteId = uid();
      await db.insert(clientes).values({
        id: clienteId,
        nombre: "Cliente Web",
        patente: p.patente,
        origen: "WEB",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: p.creadoPor,
      });
    }
  } else if (existente) {
    // Si el plan sigue vigente, se apila un ciclo más desde ahí. Si ya venció
    // (ej. el cron de Oneclick corrió atrasado, o Transbank aprobó un reintento
    // varios días después), el nuevo vencimiento se ancla a fechaContratacion
    // (vencimientoAnclado) en vez de reiniciar el ciclo desde "ahora" — la
    // vigencia de un plan Web es siempre la fecha de contratación, nunca la
    // del pago, aunque este llegue tarde. Mismo criterio que usePlanActions::
    // renovarWeb (renovación manual de un cliente Web con cobro automático
    // fallido). La excepción es `reiniciarCiclo` (reactivación promocional):
    // ahí el cliente compró un mes, no lo que quede de su ciclo viejo.
    // sigueVigenteHoy (día-granular) en vez de comparar por hora exacta — ver
    // el comentario en esa función para el bug real que causó en producción.
    const vigente = sigueVigenteHoy(existente.vencimiento);
    // `reiniciarCiclo` solo manda sobre un plan ya vencido: si entre que se
    // calculó la oferta y este punto el plan volvió a estar vigente (se lo
    // renovaron en el mesón, otro pago en otra pestaña), gana el apilado. Un
    // solo booleano para las dos escrituras —vencimiento y contratación—, que
    // tienen que salir del mismo ciclo o la ventana de pases queda corrida.
    //
    // Un cliente sin NINGUNA ancla previa (fila "Sin plan" que contrata desde
    // Mi Cuenta, ver OfertaPlan.contratacion) también arranca de cero aunque
    // el caller no pida reiniciar: no hay ciclo viejo al que anclarse, y
    // vencimientoAnclado(null) le daba el mismo mes pero sin dejar la
    // contratación escrita — o sea la ventana de pases deducida del
    // vencimiento, que es justo lo que rompe en las anclas 29/30/31 (ver
    // cicloPlanDesde y el caso HYRL56).
    const reinicia = (!!p.reiniciarCiclo || (!existente.fechaContratacion && !existente.vencimiento)) && !vigente;
    // Los dos campos del ciclo nuevo salen de acá o de ningún lado.
    const ciclo = reinicia ? cicloPlanDesde() : null;
    const nuevoVencimiento = vigente
      ? sumarMesesFecha(new Date(existente.vencimiento!), 1).toISOString()
      : (ciclo?.vencimiento ?? vencimientoAnclado(existente.fechaContratacion || existente.vencimiento));
    vencimientoResultante = nuevoVencimiento;
    clienteId = existente.id;
    const anterior = clienteFromRow(existente);
    // Resuelve un cambio de patente pendiente (ver clientes.patente_pendiente,
    // solicitado desde el módulo Clientes) — este es el único sitio de
    // renovación que NO pasa por dataAccess/clientes.ts::upsertClientes (ver
    // mismo tratamiento ahí), así que hay que replicar la resolución acá.
    const { fila, patenteAnterior } = resolverPatentePendiente(anterior, { ...anterior, vencimiento: nuevoVencimiento });
    await db
      .update(clientes)
      .set({
        patente: fila.patente ?? anterior.patente,
        patentePendiente: fila.patentePendiente || null,
        patentePendienteDesde: fila.patentePendienteDesde || null,
        vencimiento: nuevoVencimiento,
        // Reiniciar el ciclo mueve también la contratación: es el ancla con
        // que periodoPlan cuenta las pasadas incluidas (ver anclaCicloPlan) y
        // el mes recién pagado tiene que ser una sola ventana de pases, no dos.
        // Mismo trato que la recontratación del webhook de WooCommerce. Reescribe
        // `vencimiento` con el mismo valor que la línea de arriba: los dos campos
        // salen del mismo `ciclo` a propósito (ver cicloPlanDesde).
        ...(ciclo ?? {}),
        // Misma migración al X5 que en el mesón: el ilimitado viejo dejó de
        // ofrecerse, así que renovar deja al cliente en el plan vigente —
        // respetándole sin tope el mes que ya tenía comprado si renovó antes
        // de vencer (ver ilimitadoHastaAlRenovar).
        plan: PLANES[0],
        ilimitadoHasta: ilimitadoHastaAlRenovar(anterior),
        origen: "WEB",
      })
      .where(eq(clientes.id, clienteId));
    if (patenteAnterior) {
      // suscripcionesOneclick guarda su propia columna `patente` como clave de
      // búsqueda del cobro mensual siguiente (ver cobrarSuscripcion en
      // @/lib/pagos): si no se actualiza acá también, el próximo cobro
      // automático busca al cliente por la patente vieja, ya no la
      // encuentra, y termina creando un "Cliente Web" duplicado.
      await db
        .update(suscripcionesOneclick)
        .set({ patente: fila.patente, actualizadoEn: new Date().toISOString() })
        .where(eq(suscripcionesOneclick.patente, p.patente));
      cambioPatente = { cliente: { ...anterior, ...fila }, patenteAnterior };
    }
  } else {
    clienteId = uid();
    vencimientoResultante = vencimientoPorDefectoISO();
    await db.insert(clientes).values({
      id: clienteId,
      nombre: "Cliente Web",
      patente: p.patente,
      plan: PLANES[0],
      vencimiento: vencimientoResultante,
      fechaContratacion: new Date().toISOString(),
      origen: "WEB",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor: p.creadoPor,
    });
  }

  const tipo = existente ? p.tipoVentaExistente : p.tipoVentaNuevo;
  const nombre = existente?.nombre || "Cliente Web";
  const fecha = new Date().toISOString();
  const plan = p.esServicioAdicional ? "" : PLANES[0];
  await db.insert(ventas).values({
    id: p.ventaId,
    clienteId,
    patente: p.patente,
    nombre,
    plan,
    precio: p.monto,
    tipo,
    fecha,
    metodoPago: p.metodoPago,
    esServicioAdicional: p.esServicioAdicional,
    creadoPor: p.creadoPor,
    tipoDocumento: p.tipoDocumento || null,
    razonSocial: p.razonSocial || null,
    rut: p.rut || null,
    direccion: p.direccion || null,
    giro: p.giro || null,
    email: p.email || null,
    viaCupon: !!p.cuponCodigo,
    cuponCodigo: p.cuponCodigo || null,
  });

  if (p.cuponCodigo && !(await consumirCupon(p.cuponCodigo, p.patente, p.creadoPor, db))) {
    // El cobro ya se hizo con el descuento aplicado, así que la venta se
    // registra igual — esto solo deja rastro de que el cupón se había quemado
    // en el intertanto (ej. el mismo cupón canjeado en el túnel entre el
    // /crear y el /retorno de Webpay).
    console.error("Cupón ya usado al aplicar un pago aprobado", p.cuponCodigo, p.patente, p.ventaId);
  }

  // A diferencia de insertVentas (@/lib/dataAccess/ventas), esta función no
  // pasa por ahí — es el choke point de ventas confirmadas por un pago
  // externo (Webpay, Oneclick), así que dispara las reglas de WhatsApp y de
  // correo acá mismo, fire-and-forget, mismo patrón que insertVentas.ts (las
  // ventas Web/Oneclick se quedaban sin correo de confirmación porque esta
  // función solo llamaba a evaluarReglasPorVenta de WhatsApp).
  const venta: Venta = {
    id: p.ventaId,
    clienteId,
    patente: p.patente,
    nombre,
    plan,
    precio: p.monto,
    tipo,
    fecha,
    metodoPago: p.metodoPago as Venta["metodoPago"],
    esServicioAdicional: p.esServicioAdicional,
    cantidadItems: 1,
    creadoPor: p.creadoPor,
  };
  // after() en vez de un `.catch()` suelto: garantiza que Vercel mantenga la
  // función viva hasta que termine el envío (ver mismo fix en dataAccess/
  // ventas.ts::insertVentas).
  //
  // Releer la venta antes de avisar NO es paranoia: los cuatro llamadores
  // invocan esta función DENTRO de una transacción, y after() no participa de
  // ella — queda registrado apenas corre esta línea y se ejecuta igual aunque
  // la transacción revierta después. cobrarSuscripcion (@/lib/pagos) es el
  // caso grave: abre un savepoint anidado y atrapa su error para seguir, así
  // que el rollback es silencioso, y el cliente recibía un WhatsApp
  // confirmando una renovación que no ocurrió, con el vencimiento viejo —
  // Transbank ya le cobró la tarjeta y encima le mandábamos evidencia escrita
  // en contra nuestra. Un SELECT distingue "se guardó" de "se revirtió": para
  // cuando after() corre, la transacción ya resolvió. Va contra getDb() y no
  // contra `db`, que a esa altura es una transacción cerrada.
  const cambio = cambioPatente;
  after(() =>
    // El SELECT que abre evaluarReglasSiLaVentaPersistio no está guardado por
    // dentro: sin esto, una caída de conexión ahí queda como rejection sin
    // manejar en vez de un log.
    evaluarReglasSiLaVentaPersistio(venta, cambio).catch((error) =>
      console.error("Error avisando al cliente tras aplicar el pago", venta.id, venta.patente, error)
    )
  );

  // Genera/actualiza el movimiento contable de ingreso ligado a esta venta
  // en la misma transacción — ver movimientoContableDesdeVenta en helpers.ts.
  // null solo podría darse con monto $0, algo que Webpay nunca cobra, pero
  // igual se respeta el contrato de la función.
  const movimiento = movimientoContableDesdeVenta({
    id: p.ventaId,
    tipo,
    precio: p.monto,
    fecha: new Date().toISOString(),
    patente: p.patente,
    nombre,
    metodoPago: p.metodoPago,
    creadoPor: p.creadoPor,
  });
  if (movimiento) {
    const movimientoRow = movimientoToRow(movimiento);
    await db
      .insert(movimientosContables)
      .values(movimientoRow)
      .onConflictDoUpdate({ target: movimientosContables.id, set: movimientoRow });
  }

  return { clienteId, vencimiento: vencimientoResultante };
}
