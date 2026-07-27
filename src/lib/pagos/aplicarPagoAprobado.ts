import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb, type DbOrTx } from "@/db";
import { clientes, movimientosContables, suscripcionesOneclick, ventas } from "@/db/schema";
import { clienteFromRow, movimientoToRow } from "@/lib/dataAccess";
import { PLANES, movimientoContableDesdeVenta, resolverPatentePendiente, uid } from "@/lib/helpers";
import { evaluarReglasPorCambioPatente, evaluarReglasPorVenta } from "@/lib/whatsapp/reglas";
import type { Cliente, Venta } from "@/types";

export function addDaysISO(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

interface AplicarPagoParams {
  patente: string;
  monto: number;
  ventaId: string;
  metodoPago: string;
  creadoPor: string;
  esServicioAdicional: boolean;
  // Si es servicio adicional no se toca plan/vencimiento del cliente; si no,
  // se extiende (o inicia) el ciclo de 30 días como cualquier renovación web.
  tipoVentaNuevo: string;
  tipoVentaExistente: string;
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
export async function aplicarPagoAprobado(p: AplicarPagoParams, db: DbOrTx = getDb()): Promise<{ clienteId: string }> {
  const [existente] = await db.select().from(clientes).where(eq(clientes.patente, p.patente)).limit(1);

  let clienteId: string;
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
    const vencActual = existente.vencimiento ? new Date(existente.vencimiento) : null;
    const base = vencActual && vencActual > new Date() ? vencActual.toISOString() : new Date().toISOString();
    clienteId = existente.id;
    const anterior = clienteFromRow(existente);
    // Resuelve un cambio de patente pendiente (ver clientes.patente_pendiente,
    // solicitado desde el módulo Clientes) — este es el único sitio de
    // renovación que NO pasa por dataAccess/clientes.ts::upsertClientes (ver
    // mismo tratamiento ahí), así que hay que replicar la resolución acá.
    const { fila, patenteAnterior } = resolverPatentePendiente(anterior, { ...anterior, vencimiento: addDaysISO(base, 30) });
    await db
      .update(clientes)
      .set({
        patente: fila.patente,
        patentePendiente: fila.patentePendiente || null,
        patentePendienteDesde: fila.patentePendienteDesde || null,
        vencimiento: addDaysISO(base, 30),
        plan: existente.plan || PLANES[0],
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
      cambioPatente = { cliente: fila, patenteAnterior };
    }
  } else {
    clienteId = uid();
    await db.insert(clientes).values({
      id: clienteId,
      nombre: "Cliente Web",
      patente: p.patente,
      plan: PLANES[0],
      vencimiento: addDaysISO(new Date().toISOString(), 30),
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
  });

  // A diferencia de insertVentas (@/lib/dataAccess/ventas), esta función no
  // pasa por ahí — es el choke point de ventas confirmadas por un pago
  // externo (Webpay, Oneclick), así que dispara las reglas WhatsApp acá
  // mismo, fire-and-forget, mismo patrón que insertVentas.ts.
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
  after(() => evaluarReglasPorVenta([venta]).catch((error) => console.error("Error evaluando reglas de WhatsApp por venta (pago externo)", error)));
  if (cambioPatente) {
    const { cliente: clienteCambiado, patenteAnterior } = cambioPatente;
    after(() =>
      evaluarReglasPorCambioPatente(clienteCambiado, patenteAnterior).catch((error) =>
        console.error("Error evaluando reglas de WhatsApp por cambio de patente (pago externo)", error)
      )
    );
  }

  // Genera/actualiza el movimiento contable de ingreso ligado a esta venta
  // en la misma transacción — ver movimientoContableDesdeVenta en helpers.ts.
  const movimientoRow = movimientoToRow(
    movimientoContableDesdeVenta({
      id: p.ventaId,
      tipo,
      precio: p.monto,
      fecha: new Date().toISOString(),
      patente: p.patente,
      nombre,
      metodoPago: p.metodoPago,
      creadoPor: p.creadoPor,
    })
  );
  await db
    .insert(movimientosContables)
    .values(movimientoRow)
    .onConflictDoUpdate({ target: movimientosContables.id, set: movimientoRow });

  return { clienteId };
}
