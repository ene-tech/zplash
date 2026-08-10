import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { buscarClienteExistente, extraerPatente, verificarFirma } from "../shared";

export const runtime = "nodejs";

// Estados de WooCommerce Subscriptions que significan "esta suscripción ya no
// va a generar más pedidos de renovación": "cancelled" (cancelada por el
// cliente o el admin) y "expired" (terminó su plazo sin renovar). Deja afuera
// "pending-cancel" a propósito: el cliente sigue con acceso hasta el final
// del período ya pagado, así que todavía no corresponde marcarlo — WooCommerce
// manda un webhook nuevo con status "cancelled" cuando ese período termina.
const ESTADOS_CANCELACION = new Set(["cancelled", "expired"]);

/**
 * Webhook de *suscripción* de WooCommerce (topic "Subscription updated"),
 * separado del webhook de *pedidos* (../route.ts) porque son dos tipos de
 * recurso distintos en la REST API de WooCommerce, con IDs independientes —
 * mezclarlos en el mismo endpoint podría hacer que un ID de suscripción
 * colisione con un ID de pedido no relacionado.
 *
 * Solo hace una cosa: marcar `clientes.suscripcionCanceladaEn` cuando la
 * suscripción de un cliente termina. El webhook de pedidos consulta esa marca
 * para distinguir una renovación de una recontratación — ver el comentario
 * en ../route.ts.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("WOOCOMMERCE_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const rawBody = await request.text();

  // Mismo ping de conectividad que manda WooCommerce al crear/activar
  // cualquier webhook, sin importar el tópico.
  if (/^webhook_id=\d+$/.test(rawBody.trim())) {
    return NextResponse.json({ ok: true, ping: true });
  }

  const firma = request.headers.get("x-wc-webhook-signature");
  if (!verificarFirma(rawBody, firma, secreto)) {
    console.error("Firma invalida en webhook de suscripción WooCommerce", {
      largoSecreto: secreto.length,
      largoBody: rawBody.length,
      headerRecibida: firma,
    });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (!rawBody.trim()) {
    return NextResponse.json({ ok: true });
  }

  let subscription: Record<string, unknown>;
  try {
    subscription = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const subscriptionId = subscription.id;
  const status = subscription.status as string | undefined;
  if (!subscriptionId || !status) {
    return NextResponse.json({ ok: true });
  }

  if (!ESTADOS_CANCELACION.has(status)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const billing = (subscription.billing as Record<string, unknown>) || {};
  const patente = extraerPatente(subscription);
  const email = String(billing.email || "").trim().toLowerCase();

  let existente: typeof clientes.$inferSelect | undefined;
  try {
    existente = await buscarClienteExistente(patente, email);
  } catch (error) {
    console.error("Error consultando cliente desde webhook de suscripción WooCommerce", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }

  if (!existente) {
    // No hay cliente que marcar (p. ej. la suscripción nunca llegó a generar
    // un pedido "processing"/"completed" en nuestro sistema) — no es un error.
    console.log(`Suscripción WooCommerce #${subscriptionId} (${status}) sin cliente asociado (${patente || email || "sin datos"}), ignorada`);
    return NextResponse.json({ ok: true, sin_cliente: true });
  }

  try {
    await getDb()
      .update(clientes)
      .set({ suscripcionCanceladaEn: new Date().toISOString(), renovacionAutoWooDesde: null })
      .where(eq(clientes.id, existente.id));
  } catch (error) {
    console.error("Error marcando cliente como cancelado desde webhook de suscripción WooCommerce", error);
    return NextResponse.json({ error: "Error actualizando cliente" }, { status: 500 });
  }

  console.log(`Suscripción WooCommerce #${subscriptionId} (${status}) marcada para cliente ${existente.id} (${existente.patente})`);
  return NextResponse.json({ ok: true });
}
