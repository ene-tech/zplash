import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { PLANES, normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

const ESTADOS_VALIDOS = new Set(["processing", "completed"]);

function verificarFirma(rawBody: string, firma: string | null, secreto: string): boolean {
  if (!firma) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Los formularios de checkout que agregan un campo "Patente" lo guardan como
// meta_data suelto o como una clave extra dentro de billing; buscamos por
// nombre de clave en vez de asumir una ubicación fija.
function extraerPatente(order: Record<string, unknown>): string {
  const candidatos: string[] = [];
  const billing = order.billing as Record<string, unknown> | undefined;
  if (billing) {
    for (const [k, v] of Object.entries(billing)) {
      if (typeof v === "string" && /patente/i.test(k)) candidatos.push(v);
    }
  }
  const metaData = order.meta_data as Array<{ key?: string; value?: unknown }> | undefined;
  if (Array.isArray(metaData)) {
    for (const m of metaData) {
      if (m && typeof m.key === "string" && /patente/i.test(m.key) && typeof m.value === "string") {
        candidatos.push(m.value);
      }
    }
  }
  return normPlate(candidatos.find((c) => c && c.trim()) || "");
}

function addDaysISO(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

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
    const calculada = crypto.createHmac("sha256", secreto).update(rawBody, "utf8").digest("base64");
    console.error("Firma invalida en webhook WooCommerce", {
      largoSecreto: secreto.length,
      largoBody: rawBody.length,
      headerRecibida: firma,
      firmaCalculada: calculada,
      inicioBody: rawBody.slice(0, 80),
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

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const ventaId = "wc-" + orderId;
  const { data: ventaExistente } = await supabase.from("ventas").select("id").eq("id", ventaId).maybeSingle();
  if (ventaExistente) {
    console.log(`Pedido WooCommerce #${orderId} ya procesado, ignorado`);
    return NextResponse.json({ ok: true, already_processed: true });
  }

  const billing = (order.billing as Record<string, unknown>) || {};
  const patente = extraerPatente(order);
  const email = String(billing.email || "").trim().toLowerCase();
  const nombre =
    `${billing.first_name || ""} ${billing.last_name || ""}`.trim().toUpperCase() || "SIN NOMBRE";
  const telefono = String(billing.phone || "");
  const fechaOrden = order.date_created ? new Date(order.date_created as string).toISOString() : new Date().toISOString();
  const monto = Number(order.total) || 0;

  let existente: Record<string, unknown> | null = null;
  if (patente) {
    const { data } = await supabase.from("clientes").select("*").eq("patente", patente).maybeSingle();
    existente = data;
  }
  if (!existente && email) {
    const { data } = await supabase.from("clientes").select("*").ilike("email", email).maybeSingle();
    existente = data;
  }

  let clienteId: string;

  if (existente) {
    const vencActual = existente.vencimiento ? new Date(existente.vencimiento as string) : null;
    const base = vencActual && vencActual > new Date() ? vencActual.toISOString() : new Date().toISOString();
    const nuevoVencimiento = addDaysISO(base, 30);
    clienteId = existente.id as string;
    const { error } = await supabase
      .from("clientes")
      .update({
        nombre: nombre !== "SIN NOMBRE" ? nombre : existente.nombre,
        telefono: telefono || existente.telefono,
        email: email || existente.email,
        vencimiento: nuevoVencimiento,
        plan: existente.plan || PLANES[0],
        origen: "WEB",
      })
      .eq("id", clienteId);
    if (error) {
      console.error("Error actualizando cliente desde webhook WooCommerce", error);
      return NextResponse.json({ error: "Error actualizando cliente" }, { status: 500 });
    }
  } else {
    clienteId = "c" + Date.now() + Math.floor(Math.random() * 1000);
    const vencimiento = addDaysISO(fechaOrden, 30);
    const { error } = await supabase.from("clientes").insert({
      id: clienteId,
      nombre,
      patente: patente || `SIN-PATENTE-${orderId}`,
      telefono,
      email,
      plan: PLANES[0],
      vencimiento,
      fecha_contratacion: fechaOrden,
      origen: "WEB",
      visitas: 0,
      creado_en: new Date().toISOString(),
      creado_por: "WooCommerce (automático)",
    });
    if (error) {
      console.error("Error creando cliente desde webhook WooCommerce", error);
      return NextResponse.json({ error: "Error creando cliente" }, { status: 500 });
    }
  }

  const { error: ventaError } = await supabase.from("ventas").upsert({
    id: ventaId,
    cliente_id: clienteId,
    patente: patente || "",
    nombre,
    plan: PLANES[0],
    precio: monto,
    tipo: existente ? "Renovación (Web)" : "Plan nuevo (Web)",
    fecha: fechaOrden,
    operador: "Automático (Web)",
    metodo_pago: "tarjeta",
    es_servicio_adicional: false,
  });
  if (ventaError) {
    console.error("Error guardando venta desde webhook WooCommerce", ventaError);
    return NextResponse.json({ error: "Error guardando venta" }, { status: 500 });
  }

  console.log(`Pedido WooCommerce #${orderId} procesado: cliente ${clienteId} (${patente || "sin patente"})`);
  return NextResponse.json({ ok: true });
}
