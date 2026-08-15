import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { clientes, config, cupones, empresas, movimientosContables, pagosWebpayItems, ventas } from "@/db/schema";
import { movimientoToRow } from "@/lib/dataAccess";
import { generarCodigoCupon, movimientoContableDesdeVenta, uid } from "@/lib/helpers";

type PagoWebpayItemRow = typeof pagosWebpayItems.$inferSelect;

/**
 * Aplica un pago aprobado de un Pack de Tickets (cantidad libre desde
 * CANTIDAD_MINIMA_TICKETS, ver @/lib/helpers/precios): a diferencia de aplicarPagoAprobado, no
 * CREA fila en `clientes` (no hay una sola patente de auto asociada —
 * `clientes.patente` es UNIQUE, así que varias compras de empresa con
 * patente "" chocarían) ni extiende ningún plan. En vez de eso genera el
 * lote de cupones tipo "vale" (mismo esquema que VentaEmpresaTab.generar()
 * en el panel admin), la Venta con los datos de facturación del checkout, y
 * da de alta la Empresa si el RUT es nuevo (mismo patrón "el RUT manda" que
 * ya usa VentaEmpresaTab). Si el email del checkout coincide con un cliente
 * ya existente, sí se enlaza `ventas.clienteId` a ese cliente (sin crear uno
 * nuevo) para que la compra aparezca en Mi Cuenta.
 */
export async function aplicarPagoPackEmpresa(
  p: { item: PagoWebpayItemRow; ventaId: string; creadoPor: string },
  db: DbOrTx = getDb()
): Promise<void> {
  const { item } = p;
  const cantidad = item.cantidadCupones || 0;
  if (cantidad <= 0) {
    throw new Error(`pagosWebpayItems ${item.id} sin cantidadCupones válida`);
  }

  const [configRow] = await db.select({ vigenciaDiasPackEmpresa: config.vigenciaDiasPackEmpresa }).from(config).limit(1);
  // 45 (no 365): mismo default que la columna en @/db/schema/config y que
  // preciosPublicos.ts — este fallback solo aplica si la fila singleton de
  // `config` faltara por completo, pero antes de este ajuste quedó
  // desalineado con el nuevo default de vigencia del Pack de Tickets.
  const vigenciaDias = configRow?.vigenciaDiasPackEmpresa || 45;
  const fechaCaducidad = new Date(Date.now() + vigenciaDias * 86400000).toISOString();

  const existentesRows = await db.select({ codigo: cupones.codigo }).from(cupones);
  const existentes = new Set(existentesRows.map((r) => r.codigo));
  const valorPorCupon = Math.round(item.monto / cantidad);
  const ahora = new Date().toISOString();
  // El cliente manda si le puso nombre a su lote (ej. "Lavados rentacar
  // SALFA Mayo"); si no, cae a razonSocial y por último al genérico de
  // siempre.
  const nombreLote = item.nombreLote || item.razonSocial || "Pack Empresa Web";

  let clienteId: string | null = null;
  if (item.email) {
    const [clienteExistente] = await db
      .select({ id: clientes.id })
      .from(clientes)
      .where(sql`lower(${clientes.email}) = ${item.email.toLowerCase()}`)
      .limit(1);
    clienteId = clienteExistente?.id || null;
  }

  const nuevosCupones = Array.from({ length: cantidad }, (_, i) => {
    const codigo = generarCodigoCupon(existentes);
    existentes.add(codigo);
    return {
      id: `${item.id}-${i}`,
      codigo,
      nombreLote,
      valor: valorPorCupon,
      numeroLote: i + 1,
      totalLote: cantidad,
      fechaCaducidad,
      usado: false,
      creadoEn: ahora,
      creadoPor: p.creadoPor,
      tipo: "vale" as const,
      rut: item.rut || null,
      patentesAutorizadas: item.patentesAutorizadas?.length ? item.patentesAutorizadas : null,
      email: item.email || null,
    };
  });
  await db.insert(cupones).values(nuevosCupones);

  const nombreVenta = `Venta Empresa Web · ${item.nombreLote || item.razonSocial || "Cliente"}`;
  const tipoVenta = `${item.nombre} (Web)`;
  await db.insert(ventas).values({
    id: p.ventaId,
    clienteId,
    patente: "",
    nombre: nombreVenta,
    plan: "",
    precio: item.monto,
    tipo: tipoVenta,
    metodoPago: "tarjeta",
    estadoPago: "pagado",
    cantidadItems: cantidad,
    tipoDocumento: item.tipoDocumento,
    razonSocial: item.razonSocial,
    rut: item.rut,
    direccion: item.direccion,
    giro: item.giro,
    email: item.email,
    creadoPor: p.creadoPor,
  });

  // Genera/actualiza el movimiento contable de ingreso ligado a esta venta
  // en la misma transacción — ver movimientoContableDesdeVenta en helpers.ts.
  // null solo podría darse con monto $0, algo que Webpay nunca cobra, pero
  // igual se respeta el contrato de la función.
  const movimiento = movimientoContableDesdeVenta({
    id: p.ventaId,
    tipo: tipoVenta,
    precio: item.monto,
    fecha: new Date().toISOString(),
    patente: "",
    nombre: nombreVenta,
    metodoPago: "tarjeta",
    estadoPago: "pagado",
    creadoPor: p.creadoPor,
  });
  if (movimiento) {
    const movimientoRow = movimientoToRow(movimiento);
    await db
      .insert(movimientosContables)
      .values(movimientoRow)
      .onConflictDoUpdate({ target: movimientosContables.id, set: movimientoRow });
  }

  // El RUT manda (mismo criterio que VentaEmpresaTab.generar() en el panel
  // admin): si es Factura y ese RUT no pertenece a ninguna empresa ya
  // registrada, se crea una nueva en Empresas.
  if (item.tipoDocumento === "Factura" && item.rut) {
    const [existente] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.rut, item.rut)).limit(1);
    if (!existente) {
      await db.insert(empresas).values({
        id: uid(),
        razonSocial: item.razonSocial || "",
        rut: item.rut,
        giro: item.giro || null,
        direccion: item.direccion || null,
        creadoEn: ahora,
        creadoPor: p.creadoPor,
      });
    }
  }
}
