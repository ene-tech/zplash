import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { clientes, movimientosContables, ventas } from "@/db/schema";
import { movimientoToRow } from "@/lib/dataAccess";
import { PLANES, movimientoContableDesdeVenta, uid } from "@/lib/helpers";

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
    await db
      .update(clientes)
      .set({ vencimiento: addDaysISO(base, 30), plan: existente.plan || PLANES[0], origen: "WEB" })
      .where(eq(clientes.id, clienteId));
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
  await db.insert(ventas).values({
    id: p.ventaId,
    clienteId,
    patente: p.patente,
    nombre,
    plan: p.esServicioAdicional ? "" : PLANES[0],
    precio: p.monto,
    tipo,
    metodoPago: p.metodoPago,
    esServicioAdicional: p.esServicioAdicional,
    creadoPor: p.creadoPor,
  });

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
