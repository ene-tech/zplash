import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb, type DbOrTx } from "@/db";
import { clientes, movimientosContables, ventas } from "@/db/schema";
import { clienteFromRow, movimientoToRow, ventaFromRow } from "@/lib/dataAccess";
import { PLANES, movimientoContableDesdeVenta, vencimientoPorDefectoISO, ventaUpgradeElegible } from "@/lib/helpers";
import { evaluarReglasCorreoPorVenta } from "@/lib/mailing/reglas";
import { evaluarReglasPorVenta } from "@/lib/whatsapp/reglas";
import { consumirCupon } from "./cuponPlan";
import type { Venta } from "@/types";

interface AplicarUpgradeParams {
  patente: string;
  monto: number;
  ventaId: string;
  metodoPago: string;
  creadoPor: string;
  horasVentanaUpgrade: number;
  // Label de `ventas.tipo` — parametrizable porque cobrarOfertaOneclick
  // también llama esta función (cobro directo con tarjeta guardada, sin
  // pasar por Webpay) y necesita distinguirlo en el historial.
  tipoVenta?: string;
  // Cupón de descuento ya restado de `monto` — mismo trato que en
  // aplicarPagoAprobado: acá solo se sella la venta y se quema, en esta misma
  // transacción.
  cuponCodigo?: string | null;
}

/**
 * Aplica la promoción de upgrade a Plan X5 pagada desde Mi
 * Cuenta (ver calcularOfertasPlan) — equivalente Web de
 * usePlanActions.upgradeAPlan en el módulo Operador: convierte el "Lavado
 * único" ya pagado en la contratación del plan, cobrando solo el adicional
 * (`p.monto`), y ancla el vencimiento a la fecha de ESE lavado (no a la del
 * pago del upgrade) para no perderle al cliente el tiempo ya transcurrido
 * dentro de la ventana de la promoción.
 *
 * A diferencia del Operador, acá no hay `ingresos` que tocar: no es un paso
 * físico por el túnel, es una conversión remota de una compra que ya
 * ocurrió.
 */
export async function aplicarUpgradePlan(p: AplicarUpgradeParams, db: DbOrTx = getDb()): Promise<{ clienteId: string; vencimiento: string }> {
  const [existente] = await db.select().from(clientes).where(eq(clientes.patente, p.patente)).limit(1);
  if (!existente) {
    throw new Error(`aplicarUpgradePlan: no existe cliente para la patente ${p.patente}`);
  }
  const cliente = clienteFromRow(existente);

  const ventasCliente = (await db.select().from(ventas).where(eq(ventas.clienteId, cliente.id))).map(ventaFromRow);
  // Recalcula la venta de "Lavado único" que ancla el vencimiento con el
  // mismo criterio que se usó para ofrecer/cobrar la promoción. Si para
  // cuando Transbank confirma el pago esa venta ya salió de la ventana (el
  // cobro puede demorar unos minutos), se cae al último "Lavado único" que
  // exista igual — el cargo ya se hizo, no corresponde dejar al cliente sin
  // plan por una ventana de tiempo.
  const ventaUpgrade =
    ventaUpgradeElegible(ventasCliente, cliente.id, p.horasVentanaUpgrade) ??
    ventasCliente
      .filter((v) => v.tipo === "Lavado único")
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  const fechaAnclaje = ventaUpgrade ? new Date(ventaUpgrade.fecha) : new Date();

  const plan = PLANES[0];
  const nuevoVencimiento = vencimientoPorDefectoISO(fechaAnclaje);
  await db.update(clientes).set({ plan, vencimiento: nuevoVencimiento, origen: cliente.origen || "LOCAL" }).where(eq(clientes.id, cliente.id));

  const tipoVenta = p.tipoVenta || "Upgrade a Plan X5 (Web)";
  const fecha = new Date().toISOString();
  await db.insert(ventas).values({
    id: p.ventaId,
    clienteId: cliente.id,
    patente: p.patente,
    nombre: cliente.nombre,
    plan,
    precio: p.monto,
    tipo: tipoVenta,
    fecha,
    metodoPago: p.metodoPago,
    esServicioAdicional: false,
    creadoPor: p.creadoPor,
    viaCupon: !!p.cuponCodigo,
    cuponCodigo: p.cuponCodigo || null,
  });

  if (p.cuponCodigo && !(await consumirCupon(p.cuponCodigo, p.patente, p.creadoPor, db))) {
    console.error("Cupón ya usado al aplicar un upgrade de plan", p.cuponCodigo, p.patente, p.ventaId);
  }

  const venta: Venta = {
    id: p.ventaId,
    clienteId: cliente.id,
    patente: p.patente,
    nombre: cliente.nombre,
    plan,
    precio: p.monto,
    tipo: tipoVenta,
    fecha,
    metodoPago: p.metodoPago as Venta["metodoPago"],
    esServicioAdicional: false,
    cantidadItems: 1,
    creadoPor: p.creadoPor,
  };
  after(() => evaluarReglasPorVenta([venta]).catch((error) => console.error("Error evaluando reglas de WhatsApp por upgrade a plan (Web)", error)));
  after(() => evaluarReglasCorreoPorVenta([venta]).catch((error) => console.error("Error evaluando reglas de correo por upgrade a plan (Web)", error)));

  const movimiento = movimientoContableDesdeVenta({
    id: p.ventaId,
    tipo: venta.tipo,
    precio: p.monto,
    fecha,
    patente: p.patente,
    nombre: cliente.nombre,
    metodoPago: p.metodoPago,
    creadoPor: p.creadoPor,
  });
  if (movimiento) {
    const movimientoRow = movimientoToRow(movimiento);
    await db.insert(movimientosContables).values(movimientoRow).onConflictDoUpdate({ target: movimientosContables.id, set: movimientoRow });
  }

  return { clienteId: cliente.id, vencimiento: nuevoVencimiento };
}
