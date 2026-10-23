import "server-only";

import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { empresaPorRut } from "@/lib/dataAccess/empresas";
import { liberarVentasFactura, marcarFacturaEmitida, reservarVentasFactura, ventasPorFolio, ventasPorIds } from "@/lib/dataAccess/ventas";
import { diaCaja, esEmailEnviable, fmtCLP, formatRut } from "@/lib/helpers";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { emitirFactura, ErrorFactura, pdfFactura, type MotivoFalloFactura, type ReceptorFactura } from "@/lib/simplefactura";
import type { Cliente, Venta } from "@/types";

// Emisión de facturas (SimpleFactura) y su envío por correo. Sin chequeo de
// permisos a propósito: lo llaman insertVentas (factura automática al vender)
// y las Server Actions de @/lib/serverActions/facturacion, que sí chequean.

export type ResultadoCorreoFactura = { ok: true; email: string } | { ok: false; error: string };
export type ResultadoFactura = { ok: true; folio: number; correo: ResultadoCorreoFactura } | { ok: false; error: string; motivo?: MotivoFalloFactura };

const ASUNTO_FACTURA = "Factura Lavado de Autos - Zplash";

function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function clientesDe(ventas: Venta[]): Promise<Map<string, Cliente>> {
  return new Map((await getClientesByIds(ventas.map((v) => v.clienteId).filter(Boolean))).map((c) => [c.id, c]));
}

/** `soloFicha`: el receptor sale SIEMPRE de la ficha del cliente, nunca de la
 * venta. Lo usa la factura automática de las ventas del mesón, cuyas filas
 * arma el navegador: con los datos de la venta, un POST directo podía emitir
 * una factura real a un RUT ajeno y mandarse el PDF a su propio correo. */
export interface OpcionesFactura {
  soloFicha?: boolean;
}

// Compra web: los datos de facturación vienen en la venta. Cliente con
// Factura en su ficha (mesón): vienen del cliente.
function receptorDe(v: Venta, clientes: Map<string, Cliente>, { soloFicha }: OpcionesFactura = {}): ReceptorFactura {
  const fuente = v.rut && !soloFicha ? v : clientes.get(v.clienteId);
  return {
    rut: fuente?.rut || "",
    razonSocial: fuente?.razonSocial || "",
    giro: fuente?.giro || "",
    direccion: fuente?.direccion,
    email: fuente?.email,
  };
}

// Manda el PDF de la factura al correo del contacto de la empresa (Empresas →
// persona de contacto). Si la empresa no está registrada o su contacto no
// tiene correo, cae al correo de la compra web o de la ficha del cliente.
export async function mandarFacturaPorCorreo(folio: number, ventas: Venta[], { soloFicha }: OpcionesFactura = {}): Promise<ResultadoCorreoFactura> {
  const clientes = await clientesDe(ventas);
  const v0 = ventas[0];
  const rut = (!soloFicha && v0.rut) || clientes.get(v0.clienteId)?.rut;
  const empresa = rut ? await empresaPorRut(rut) : null;
  const contacto = empresa?.contactoClienteId ? (await getClientesByIds([empresa.contactoClienteId]))[0] : undefined;
  const email = [contacto?.email, soloFicha ? undefined : v0.email, clientes.get(v0.clienteId)?.email].find((e) => esEmailEnviable(e))?.trim();
  if (!email) return { ok: false, error: "la empresa no tiene correo de contacto" };

  let pdf: Buffer;
  try {
    pdf = await pdfFactura(folio);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const total = ventas.reduce((s, v) => s + v.precio, 0);
  const razonSocial = empresa?.razonSocial || (!soloFicha && v0.razonSocial) || clientes.get(v0.clienteId)?.razonSocial || "";
  const html = envolverHtmlBase(
    `<p style="margin:0 0 16px;">Hola${razonSocial ? ` <strong>${escapeHtml(razonSocial)}</strong>` : ""},</p>` +
      `<p style="margin:0 0 16px;">Adjuntamos la factura electrónica N° <strong>${folio}</strong> por ${fmtCLP(total)}.</p>` +
      `<p style="margin:0 0 16px;">Gracias por preferir Zplash.</p>`,
    { boton: false }
  );
  const r = await enviarCorreoTransaccional({
    to: email,
    subject: ASUNTO_FACTURA,
    html,
    adjuntos: [{ nombre: `Factura-${folio}.pdf`, contenido: pdf }],
    clienteId: contacto?.id || v0.clienteId || undefined,
  });
  return r.ok ? { ok: true, email } : { ok: false, error: r.error || "no se pudo enviar" };
}

export async function reenviarFactura(folio: number): Promise<ResultadoCorreoFactura> {
  const ventas = await ventasPorFolio(folio);
  if (!ventas.length) return { ok: false, error: `No hay ventas con la factura N° ${folio}` };
  return mandarFacturaPorCorreo(folio, ventas);
}

// Emite UNA factura electrónica por todas las ventas pedidas (deben ser del
// mismo RUT), las deja marcadas como emitidas y la manda por correo. Montos y
// receptor se leen de la base, nunca del navegador.
export async function emitirFacturaDeVentas(ventaIds: string[], opciones: OpcionesFactura = {}): Promise<ResultadoFactura> {
  // Las ya emitidas se saltan (re-emitirlas duplicaría la factura ante el SII),
  // pero no traban al resto del grupo.
  const candidatas = (await ventasPorIds(ventaIds)).filter((v) => v.precio > 0 && !v.facturaEmitida);
  if (!candidatas.length) return { ok: false, error: "No hay ventas con monto pendientes de factura" };

  const clientes = await clientesDe(candidatas);
  const receptores = candidatas.map((v) => receptorDe(v, clientes, opciones));
  const receptor = receptores[0];
  // Comuna y ciudad solo existen en la ficha de Empresas.
  const empresa = receptor.rut ? await empresaPorRut(receptor.rut) : null;
  receptor.comuna = empresa?.comuna;
  receptor.ciudad = empresa?.ciudad;
  const falta = [!receptor.rut && "RUT", !receptor.razonSocial && "razón social", !receptor.giro && "giro", !receptor.direccion?.trim() && "dirección"].filter(Boolean);
  if (falta.length) return { ok: false, error: `Faltan datos de facturación: ${falta.join(", ")}` };
  if (receptores.some((r) => formatRut(r.rut) !== formatRut(receptor.rut))) return { ok: false, error: "Las ventas son de RUTs distintos" };

  const reservadas = new Set(await reservarVentasFactura(candidatas.map((v) => v.id)));
  const ventas = candidatas.filter((v) => reservadas.has(v.id));
  if (!ventas.length) return { ok: false, error: "Esas ventas ya se están facturando" };

  let folio: number;
  try {
    folio = await emitirFactura(ventas, receptor, diaCaja(new Date().toISOString()));
  } catch (e) {
    const motivo: MotivoFalloFactura = e instanceof ErrorFactura ? e.motivo : "incierto";
    const error = e instanceof Error ? e.message : String(e);
    if (motivo === "incierto") {
      // Sin liberar: el folio pudo asignarse y liberar la reserva dejaría
      // emitirla otra vez. Quedan emitidas sin folio (Facturas las muestra
      // así) hasta revisarlas en SimpleFactura.
      console.error("Factura sin confirmar: revisar en SimpleFactura", ventas.map((v) => v.id), error);
      return { ok: false, motivo, error: `${error}. No se sabe si la factura alcanzó a emitirse: revísela en SimpleFactura antes de volver a intentarlo.` };
    }
    await liberarVentasFactura(ventas.map((v) => v.id));
    return { ok: false, motivo, error };
  }
  if (!(await marcarFacturaEmitida(ventas.map((v) => v.id), folio))) {
    // Quedan marcadas emitidas (por la reserva) pero sin folio en la base.
    return { ok: false, error: `Se emitió la factura N° ${folio} pero no se pudo guardar su folio en la base.` };
  }
  // La factura ya quedó emitida: un fallo del correo solo se avisa.
  return { ok: true, folio, correo: await mandarFacturaPorCorreo(folio, ventas, opciones) };
}

// Factura automática al vender: la llaman insertVentas (mesón) y, para lo
// cobrado por Webpay/Oneclick, evaluarReglasSiLaVentaPersistio y el retorno
// del Pack Empresa. Recibe ids y relee de la base: las ventas online se
// insertan dentro de una transacción, y una que se revirtió no existe acá.
// Una factura por RUT dentro de la tanda (un carrito del mesón sale en una
// sola). Solo ventas pagadas: una "por pagar" o con abono puede anularse antes
// de cobrarse, y queda pendiente en el cierre como siempre. Si faltan datos o
// SimpleFactura la rechaza, también queda pendiente en el cierre; si no se
// sabe si salió, queda emitida sin folio para revisarla a mano.
export async function emitirFacturasAutomaticas(ventaIds: string[], opciones: OpcionesFactura = {}): Promise<void> {
  const nuevas = await ventasPorIds(ventaIds);
  const conMonto = nuevas.filter((v) => v.precio > 0 && !v.facturaEmitida && (!v.estadoPago || v.estadoPago === "pagado"));
  if (!conMonto.length) return;
  const clientes = await clientesDe(conMonto);
  const grupos = new Map<string, string[]>();
  for (const v of conMonto) {
    const fichaPideFactura = clientes.get(v.clienteId)?.tipoDocumento === "Factura";
    // Con soloFicha la venta solo puede pedir MENOS (una Boleta elegida en el
    // mesón), nunca convertir en factura a un cliente que no la tiene.
    const pideFactura = opciones.soloFicha
      ? fichaPideFactura && v.tipoDocumento !== "Boleta"
      : v.tipoDocumento === "Factura" || (!v.tipoDocumento && fichaPideFactura);
    if (!pideFactura) continue;
    const rut = receptorDe(v, clientes, opciones).rut;
    if (!rut) continue;
    const key = formatRut(rut);
    grupos.set(key, [...(grupos.get(key) || []), v.id]);
  }
  for (const [rut, ids] of grupos) {
    let r = await emitirFacturaDeVentas(ids, opciones);
    // Lo transitorio (token, 429) falló antes de mandar la factura: se puede
    // reintentar sin riesgo de duplicarla.
    for (const espera of REINTENTOS_FACTURA_MS) {
      if (r.ok || r.motivo !== "transitorio") break;
      await new Promise((ok) => setTimeout(ok, espera));
      r = await emitirFacturaDeVentas(ids, opciones);
    }
    if (!r.ok) console.error("Factura automática no emitida", rut, ids, r.motivo, r.error);
    else if (!r.correo.ok) console.error("Factura automática emitida sin correo", r.folio, r.correo.error);
  }
}

const REINTENTOS_FACTURA_MS = [3_000, 10_000];
