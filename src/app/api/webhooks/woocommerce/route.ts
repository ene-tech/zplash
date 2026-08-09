import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, movimientosContables, ventas } from "@/db/schema";
import { movimientoToRow } from "@/lib/dataAccess";
import { PLANES, formatTelefono, movimientoContableDesdeVenta, sigueVigenteHoy, vencimientoAnclado } from "@/lib/helpers";
import { addDaysISO, buscarClienteExistente, extraerPatente, huboRenovacionWebReciente, verificarFirma } from "./shared";

export const runtime = "nodejs";
// Reexportado para no romper route.test.ts, que prueba la firma HMAC contra este módulo.
export { verificarFirma };

const ESTADOS_VALIDOS = new Set(["processing", "completed"]);

export async function POST(request: NextRequest) {
  const secreto = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("WOOCOMMERCE_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const rawBody = await request.text();

  // Al crear/activar el webhook, WooCommerce manda un ping de conectividad
  // "webhook_id=N" sin firma (no trae datos sensibles, solo confirma la URL).
  if (/^webhook_id=\d+$/.test(rawBody.trim())) {
    return NextResponse.json({ ok: true, ping: true });
  }

  const firma = request.headers.get("x-wc-webhook-signature");
  if (!verificarFirma(rawBody, firma, secreto)) {
    // No se loggea el body ni la firma calculada: el body de un pedido trae
    // datos de clientes (nombre, email, teléfono) y no hace falta su
    // contenido para diagnosticar un problema de firma.
    console.error("Firma invalida en webhook WooCommerce", {
      largoSecreto: secreto.length,
      largoBody: rawBody.length,
      headerRecibida: firma,
    });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (!rawBody.trim()) {
    return NextResponse.json({ ok: true });
  }

  let order: Record<string, unknown>;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const orderId = order.id;
  const status = order.status as string | undefined;
  if (!orderId || !status) {
    return NextResponse.json({ ok: true });
  }

  if (!ESTADOS_VALIDOS.has(status)) {
    console.log(`Pedido WooCommerce #${orderId} con estado '${status}', ignorado`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = getDb();
  const ventaId = "wc-" + orderId;
  const billing = (order.billing as Record<string, unknown>) || {};
  const patente = extraerPatente(order);
  const email = String(billing.email || "").trim().toLowerCase();
  const nombre = `${billing.first_name || ""} ${billing.last_name || ""}`.trim().toUpperCase() || "SIN NOMBRE";
  const telefono = formatTelefono(String(billing.phone || ""));
  const fechaOrden = order.date_created ? new Date(order.date_created as string).toISOString() : new Date().toISOString();
  const monto = Number(order.total) || 0;

  let existente: typeof clientes.$inferSelect | undefined;
  try {
    const [ventaExistente] = await db.select({ id: ventas.id }).from(ventas).where(eq(ventas.id, ventaId)).limit(1);
    if (ventaExistente) {
      console.log(`Pedido WooCommerce #${orderId} ya procesado, ignorado`);
      return NextResponse.json({ ok: true, already_processed: true });
    }

    existente = await buscarClienteExistente(patente, email);
  } catch (error) {
    console.error("Error consultando datos desde webhook WooCommerce", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }

  let clienteId: string;
  // Si el webhook de suscripción (ver ./suscripcion/route.ts) marcó que la
  // suscripción anterior de este cliente se canceló/venció, este pedido no es
  // una renovación del ciclo viejo — es una recontratación. Se reinicia
  // fechaContratacion/vencimiento igual que un cliente nuevo, en vez de
  // apilar sobre (o anclar a) el ciclo que el cliente ya había cancelado.
  const recontratacion = !!(existente && existente.suscripcionCanceladaEn);
  // Duplicado sospechoso: ver huboRenovacionWebReciente en ./shared — no
  // apila otro ciclo de 30 días a ciegas, deja el vencimiento como estaba y
  // marca la venta para que un operador la revise (ver más abajo, creadoPor).
  let duplicadoSospechoso = false;

  if (existente) {
    clienteId = existente.id;
    let nuevoVencimiento: string;
    if (recontratacion) {
      nuevoVencimiento = addDaysISO(fechaOrden, 30);
    } else {
      duplicadoSospechoso = await huboRenovacionWebReciente(existente.id, fechaOrden);
      if (duplicadoSospechoso) {
        console.warn(`Pedido WooCommerce #${orderId}: renovación reciente ya registrada para el cliente ${existente.id}, no se extiende el vencimiento (revisar manualmente)`);
        nuevoVencimiento = existente.vencimiento || addDaysISO(fechaOrden, 30);
      } else {
        // Si el plan sigue vigente, se apila un ciclo más desde ahí. Si ya
        // venció (mismo criterio que aplicarPagoAprobado y renovarWeb, ver
        // accb3d9), el nuevo vencimiento se ancla a fechaContratacion en vez
        // de reiniciar el ciclo desde "ahora" — la vigencia de un plan Web es
        // siempre la fecha de contratación, nunca la del pago.
        // sigueVigenteHoy (día-granular, no hora exacta) y no
        // `vencActual > new Date()`: WooCommerce suele mandar el webhook de
        // renovación de noche en Chile, y una comparación por hora exacta
        // marcaba como "ya vencido" un plan que técnicamente vencía más
        // tarde ese mismo día — ver sigueVigenteHoy para el caso real.
        nuevoVencimiento = sigueVigenteHoy(existente.vencimiento)
          ? addDaysISO(existente.vencimiento!, 30)
          : vencimientoAnclado(existente.fechaContratacion || existente.vencimiento);
      }
    }
    try {
      await db
        .update(clientes)
        .set({
          nombre: nombre !== "SIN NOMBRE" ? nombre : existente.nombre,
          telefono: telefono || existente.telefono,
          email: email || existente.email,
          vencimiento: nuevoVencimiento,
          plan: recontratacion ? PLANES[0] : existente.plan || PLANES[0],
          // Recontratación: reinicia el ciclo igual que un cliente nuevo, y
          // limpia la marca de cancelación que puso el webhook de suscripción.
          ...(recontratacion ? { fechaContratacion: fechaOrden, suscripcionCanceladaEn: null } : {}),
          origen: "WEB",
        })
        .where(eq(clientes.id, clienteId));
    } catch (error) {
      console.error("Error actualizando cliente desde webhook WooCommerce", error);
      return NextResponse.json({ error: "Error actualizando cliente" }, { status: 500 });
    }
  } else {
    clienteId = "c" + Date.now() + Math.floor(Math.random() * 1000);
    const vencimiento = addDaysISO(fechaOrden, 30);
    try {
      await db.insert(clientes).values({
        id: clienteId,
        nombre,
        patente: patente || `SIN-PATENTE-${orderId}`,
        telefono,
        email,
        plan: PLANES[0],
        vencimiento,
        fechaContratacion: fechaOrden,
        origen: "WEB",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: "WooCommerce (automático)",
      });
    } catch (error) {
      console.error("Error creando cliente desde webhook WooCommerce", error);
      return NextResponse.json({ error: "Error creando cliente" }, { status: 500 });
    }
  }

  const tipoVenta = existente && !recontratacion ? "Renovación (Web)" : "Plan nuevo (Web)";
  const ventaData = {
    clienteId,
    patente: patente || "",
    nombre,
    plan: PLANES[0],
    precio: monto,
    tipo: tipoVenta,
    fecha: fechaOrden,
    creadoPor: duplicadoSospechoso ? "Automático (Web) — posible duplicado, revisar vencimiento" : "Automático (Web)",
    metodoPago: "tarjeta",
    esServicioAdicional: false,
  };
  try {
    await db
      .insert(ventas)
      .values({ id: ventaId, ...ventaData })
      .onConflictDoUpdate({ target: ventas.id, set: ventaData });

    // Genera/actualiza el movimiento contable de ingreso ligado a esta venta
    // — ver movimientoContableDesdeVenta en @/lib/helpers. null solo se daría
    // con monto $0, algo que WooCommerce nunca cobra, pero igual se respeta
    // el contrato de la función.
    const movimiento = movimientoContableDesdeVenta({
      id: ventaId,
      tipo: tipoVenta,
      precio: monto,
      fecha: fechaOrden,
      patente: patente || "",
      nombre,
      metodoPago: "tarjeta",
      creadoPor: "Automático (Web)",
    });
    if (movimiento) {
      const movimientoRow = movimientoToRow(movimiento);
      await db
        .insert(movimientosContables)
        .values(movimientoRow)
        .onConflictDoUpdate({ target: movimientosContables.id, set: movimientoRow });
    }
  } catch (error) {
    console.error("Error guardando venta desde webhook WooCommerce", error);
    return NextResponse.json({ error: "Error guardando venta" }, { status: 500 });
  }

  console.log(`Pedido WooCommerce #${orderId} procesado: cliente ${clienteId} (${patente || "sin patente"})`);
  return NextResponse.json({ ok: true });
}
