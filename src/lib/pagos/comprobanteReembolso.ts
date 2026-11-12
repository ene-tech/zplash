import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clienteAdjuntos, cobrosOneclick, pagosWebpay, pagosWebpayItems, ventas } from "@/db/schema";
import { borrarArchivoAdjuntoCliente, subirArchivoAdjuntoCliente } from "@/lib/dataAccess/clienteAdjuntos";
import { pdfTexto } from "@/lib/pdf/pdfTexto";
import { CREADO_POR_REEMBOLSO, esEmailEnviable, fmtCLP, PREFIJO_VENTA_REEMBOLSO, TIPO_VENTA_REEMBOLSO } from "@/lib/helpers";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";

// Comprobante de una devolución a la tarjeta (ver reembolsarVentaTarjeta). Se
// arma siempre con armarComprobanteReembolso a partir de lo que quedó escrito
// (contra-asiento + compra original + pago Transbank), así el correo, el SMS y
// el que se ve en la ficha del cliente muestran exactamente lo mismo, sin una
// columna aparte que guardar.

export { CREADO_POR_REEMBOLSO };

/** El pago Transbank que se devolvió. */
export interface PagoReembolsado {
  medio: "Webpay" | "Oneclick";
  ordenCompra: string;
  cobrado: number;
  /** "Visa **** 1234"; solo Oneclick guarda la tarjeta. */
  tarjeta?: string;
}

export interface ComprobanteReembolso {
  id: string;
  fecha: string;
  nombre: string;
  patente: string;
  monto: number;
  cobrado: number;
  parcial: boolean;
  medio: PagoReembolsado["medio"];
  ordenCompra: string;
  tarjeta?: string;
  /** REVERSED (mismo día, sin código) → "Reversa"; NULLIFIED → "Anulación". */
  operacion: "Reversa" | "Anulación";
  codigoAutorizacion?: string;
  compra: { tipo: string; fecha: string };
  motivo?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// En Santiago y no en la TZ del server (Vercel corre en UTC).
const fmtFechaChile = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtFechaHoraChile = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/** El motivo dentro de las notas que escribe reembolsarVentaTarjeta:
 * `Reembolso[ parcial] de "<tipo>" del <fecha> — <motivo> (por <operador>)[ — vigencia anulada (...)]`. */
export function motivoDeNotasReembolso(notas: string | undefined): string | undefined {
  // "(por …)" admite paréntesis dentro del nombre del operador: el motivo
  // llega hasta el último " (por ".
  const m = /^Reembolso(?: parcial)? de ".*?" del \d{4}-\d{2}-\d{2} — ([\s\S]*) \(por .*\)(?: — vigencia anulada \([^)]*\))?$/.exec(notas || "");
  return m?.[1].trim() || undefined;
}

export function armarComprobanteReembolso(
  reembolso: { id: string; fecha: string; nombre: string; patente: string; precio: number; voucher?: string | null; notas?: string | null },
  compra: { tipo: string; fecha: string },
  pago: PagoReembolsado
): ComprobanteReembolso {
  const monto = -reembolso.precio;
  // reembolsarVentaTarjeta guarda authorization_code o, si no vino (REVERSED), el type.
  const voucher = reembolso.voucher || "";
  const sinCodigo = !voucher || voucher === "REVERSED" || voucher === "NULLIFIED";
  return {
    id: reembolso.id,
    fecha: reembolso.fecha,
    nombre: reembolso.nombre,
    patente: reembolso.patente,
    monto,
    cobrado: pago.cobrado,
    parcial: monto < pago.cobrado,
    medio: pago.medio,
    ordenCompra: pago.ordenCompra,
    tarjeta: pago.tarjeta,
    operacion: voucher === "REVERSED" ? "Reversa" : "Anulación",
    codigoAutorizacion: sinCodigo ? undefined : voucher,
    compra,
    motivo: motivoDeNotasReembolso(reembolso.notas ?? undefined),
  };
}

/** Asunto del correo, el mismo al reembolsar y al reenviar desde la ficha. */
export function asuntoComprobanteReembolso(c: ComprobanteReembolso): string {
  return `Comprobante de devolución: ${fmtCLP(c.monto)} a tu tarjeta`;
}

const TEXTO_PLAZO_BANCO =
  "El abono lo verás reflejado en tu tarjeta dentro de los próximos días, según los plazos de tu banco. Cualquier duda, escríbenos a info@zplash.cl.";

/** Correo completo (con la plantilla de marca); es también el que se ve en la ficha. */
export function htmlComprobanteReembolso(c: ComprobanteReembolso): string {
  const tabla = filasComprobante(c)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0; color:#8a8780; font-size:13px; vertical-align:top; white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0; font-size:14px;">${esc(v)}</td></tr>`
    )
    .join("");
  return envolverHtmlBase(
    `
    <p style="margin:0 0 4px; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#8a8780;">Comprobante de devolución</p>
    <p style="margin:0 0 20px;">Hola ${esc(c.nombre)}, te hicimos una devolución a tu tarjeta.</p>
    <p style="margin:0 0 20px; font-size:32px; font-weight:bold; color:#262320;">${fmtCLP(c.monto)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px; border-collapse:collapse;">${tabla}</table>
    <p style="margin:0;">${TEXTO_PLAZO_BANCO}</p>
  `,
    { boton: false }
  );
}

/** El mismo comprobante en PDF: es el que queda en los adjuntos de la ficha y
 * el que va adjunto en el correo. */
export function pdfComprobanteReembolso(c: ComprobanteReembolso): Buffer {
  return pdfTexto(
    [
      { texto: "ZPlash", tamano: 18, negrita: true },
      { texto: "COMPROBANTE DE DEVOLUCIÓN", tamano: 9, gris: 0.5, antes: 4 },
      { texto: `${c.nombre}, te hicimos una devolución a tu tarjeta.`, tamano: 11, antes: 18 },
      { texto: fmtCLP(c.monto), tamano: 28, negrita: true, antes: 10 },
      ...filasComprobante(c).map(([k, v], i) => ({ texto: k, valor: v, tamano: 10, antes: i === 0 ? 16 : 2 })),
      { texto: TEXTO_PLAZO_BANCO, tamano: 10, antes: 22 },
    ],
    `Comprobante de devolución ${c.id}`
  );
}

export function nombreArchivoComprobante(c: ComprobanteReembolso): string {
  return `comprobante-devolucion-${(c.patente || "zplash").toUpperCase()}-${c.fecha.slice(0, 10)}.pdf`;
}

function filasComprobante(c: ComprobanteReembolso): [string, string][] {
  return [
    ["Fecha de la devolución", fmtFechaHoraChile(c.fecha)],
    ["Monto devuelto", `${fmtCLP(c.monto)}${c.parcial ? ` (parcial, de ${fmtCLP(c.cobrado)} cobrados)` : ""}`],
    ["Operación Transbank", `${c.operacion} ${c.medio}`],
    ...(c.codigoAutorizacion ? ([["Código de autorización", c.codigoAutorizacion]] as [string, string][]) : []),
    ["Orden de compra", c.ordenCompra],
    ...(c.tarjeta ? ([["Tarjeta", c.tarjeta]] as [string, string][]) : []),
    ["Compra devuelta", `${c.compra.tipo} del ${fmtFechaChile(c.compra.fecha)}`],
    ...(c.patente ? ([["Patente", c.patente]] as [string, string][]) : []),
    // Texto libre del operador: acotado para que quepa en el PDF de una página.
    ...(c.motivo ? ([["Motivo", c.motivo.length > 300 ? c.motivo.slice(0, 300) + "…" : c.motivo]] as [string, string][]) : []),
    ["N° de comprobante", c.id],
  ];
}

/** Rearma el comprobante de un contra-asiento ya escrito (ficha del cliente).
 * null si no es un reembolso a la tarjeta por Transbank (ej. la reversa de una
 * nota de crédito en efectivo, que también es tipo "Reembolso"). */
export async function cargarComprobanteReembolso(reembolsoId: string): Promise<ComprobanteReembolso | null> {
  return (await cargarComprobanteConCliente(reembolsoId))?.comprobante ?? null;
}

/** Reenvía por correo el comprobante de una devolución ya hecha, desde la
 * ficha. `email` lo escribe el operador (por defecto el de la ficha); el
 * HTML se rearma desde la base, igual que el que se ve en pantalla. */
export async function reenviarComprobanteReembolso(reembolsoId: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const destino = email.trim();
  if (!esEmailEnviable(destino)) return { ok: false, error: "El correo no es válido." };
  const cargado = await cargarComprobanteConCliente(reembolsoId);
  if (!cargado) return { ok: false, error: "Esta devolución no se hizo por Transbank: no tiene comprobante." };
  const r = await enviarCorreoTransaccional({
    to: destino,
    subject: asuntoComprobanteReembolso(cargado.comprobante),
    html: htmlComprobanteReembolso(cargado.comprobante),
    adjuntos: [{ nombre: nombreArchivoComprobante(cargado.comprobante), contenido: pdfComprobanteReembolso(cargado.comprobante) }],
    clienteId: cargado.clienteId,
  });
  return r.ok ? { ok: true } : { ok: false, error: "No se pudo enviar el correo." };
}

/** Id del adjunto del comprobante en la ficha: determinístico, así generarlo
 * dos veces (reembolso + backfill, o un reintento) no lo duplica. */
export function idAdjuntoComprobante(reembolsoId: string): string {
  return `adj-${reembolsoId}`;
}

/** El reembolso detrás de un adjunto que dejó adjuntarComprobanteReembolso;
 * null si es un documento subido a mano. */
export function reembolsoIdDeAdjunto(adjuntoId: string): string | null {
  return adjuntoId.startsWith(`adj-${PREFIJO_VENTA_REEMBOLSO}`) ? adjuntoId.slice(4) : null;
}

/** Deja el PDF del comprobante en "Documentos adjuntos" de la ficha del
 * cliente (tipo devolución). Idempotente; false si no hay comprobante o
 * cliente, o si falló la subida. */
export async function adjuntarComprobanteReembolso(reembolsoId: string): Promise<boolean> {
  const cargado = await cargarComprobanteConCliente(reembolsoId);
  if (!cargado?.clienteId) return false;
  const { comprobante: c, clienteId } = cargado;
  const id = idAdjuntoComprobante(reembolsoId);
  const pdf = pdfComprobanteReembolso(c);
  const ruta = `${clienteId}/${id}.pdf`;
  if (!(await subirArchivoAdjuntoCliente(ruta, pdf, "application/pdf"))) return false;
  try {
    await getDb()
    .insert(clienteAdjuntos)
    .values({
      id,
      clienteId,
      tipo: "devolucion",
      detalle: `Devolución de ${fmtCLP(c.monto)} a la tarjeta (${c.operacion} ${c.medio}, orden ${c.ordenCompra}) por ${c.compra.tipo} del ${fmtFechaChile(c.compra.fecha)}`,
      nombreArchivo: nombreArchivoComprobante(c),
      tipoMime: "application/pdf",
      tamano: pdf.length,
      ruta,
      subidoEn: c.fecha,
      subidoPor: CREADO_POR_REEMBOLSO,
    })
    .onConflictDoNothing();
  } catch (error) {
    // Sin fila no hay cómo verlo ni borrarlo desde la ficha: se saca el
    // archivo para no dejar datos del cliente huérfanos en el bucket.
    console.error("Error anotando el comprobante adjunto", reembolsoId, error);
    await borrarArchivoAdjuntoCliente(ruta);
    return false;
  }
  return true;
}

async function cargarComprobanteConCliente(reembolsoId: string): Promise<{ comprobante: ComprobanteReembolso; clienteId?: string } | null> {
  if (!reembolsoId.startsWith(PREFIJO_VENTA_REEMBOLSO)) return null;
  const ventaId = reembolsoId.slice(PREFIJO_VENTA_REEMBOLSO.length);
  const db = getDb();
  const [[reembolso], [original], [itemWebpay], [cobro]] = await Promise.all([
    // Columnas explícitas: un select() de toda la fila se cae si el schema
    // trae una columna que la base todavía no tiene.
    db
      .select({
        id: ventas.id,
        clienteId: ventas.clienteId,
        fecha: ventas.fecha,
        nombre: ventas.nombre,
        patente: ventas.patente,
        precio: ventas.precio,
        tipo: ventas.tipo,
        creadoPor: ventas.creadoPor,
        voucher: ventas.voucher,
        notas: ventas.notas,
      })
      .from(ventas)
      .where(eq(ventas.id, reembolsoId))
      .limit(1),
    db.select({ tipo: ventas.tipo, fecha: ventas.fecha }).from(ventas).where(eq(ventas.id, ventaId)).limit(1),
    db
      .select({ monto: pagosWebpayItems.monto, buyOrder: pagosWebpay.buyOrder, token: pagosWebpay.token })
      .from(pagosWebpayItems)
      .innerJoin(pagosWebpay, eq(pagosWebpay.buyOrder, pagosWebpayItems.buyOrder))
      .where(and(eq(pagosWebpayItems.ventaId, ventaId), eq(pagosWebpay.estado, "aprobada")))
      .limit(1),
    db
      .select({ id: cobrosOneclick.id, monto: cobrosOneclick.monto })
      .from(cobrosOneclick)
      .where(and(eq(cobrosOneclick.ventaId, ventaId), eq(cobrosOneclick.estado, "aprobada")))
      .limit(1),
  ]);
  // creadoPor distingue la devolución por Transbank de la reversa de nota de
  // crédito en efectivo/transferencia, que usa el mismo id aunque la compra
  // original se haya pagado por Webpay.
  if (!reembolso || reembolso.tipo !== TIPO_VENTA_REEMBOLSO || reembolso.creadoPor !== CREADO_POR_REEMBOLSO || !original) return null;
  // Mismo criterio que reembolsarVentaTarjeta: Webpay solo si tiene token
  // (sin él no se pudo devolver por ahí), si no Oneclick.
  const pago: PagoReembolsado | null = itemWebpay?.token
    ? { medio: "Webpay", ordenCompra: itemWebpay.buyOrder, cobrado: itemWebpay.monto }
    : cobro
      ? { medio: "Oneclick", ordenCompra: cobro.id, cobrado: cobro.monto }
      : null;
  if (!pago) return null;
  const comprobante = armarComprobanteReembolso(
    { id: reembolso.id, fecha: reembolso.fecha, nombre: reembolso.nombre, patente: reembolso.patente, precio: reembolso.precio ?? 0, voucher: reembolso.voucher, notas: reembolso.notas },
    original,
    pago
  );
  return { comprobante, clienteId: reembolso.clienteId ?? undefined };
}
