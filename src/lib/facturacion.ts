import "server-only";

import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { empresaPorRut } from "@/lib/dataAccess/empresas";
import { liberarVentasFactura, marcarFacturaEmitida, marcarNotaCredito, reservarNotaCredito, reservarVentasFactura, ventasPorFolio, ventasPorIds } from "@/lib/dataAccess/ventas";
import { diaCaja, esEmailEnviable, fmtCLP, formatRut } from "@/lib/helpers";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { MOTIVOS_NOTA_CREDITO, type MotivoNotaCredito } from "@/lib/logic/empresas";
import { datosFactura, emitirFactura, emitirNotaCredito, ErrorFactura, pdfFactura, type MotivoFalloFactura, type ReceptorFactura } from "@/lib/simplefactura";
import type { Cliente, Venta } from "@/types";

// Emisión de facturas (SimpleFactura) y su envío por correo. Sin chequeo de
// permisos a propósito: lo llaman insertVentas (factura automática al vender)
// y las Server Actions de @/lib/serverActions/facturacion, que sí chequean.

export type ResultadoCorreoFactura = { ok: true; email: string } | { ok: false; error: string };
export type ResultadoFactura = { ok: true; folio: number; correo: ResultadoCorreoFactura } | { ok: false; error: string; motivo?: MotivoFalloFactura };
export type ResultadoNotaCredito = ResultadoFactura;

const ASUNTO_FACTURA = "Factura Lavado de Autos - Zplash";
const ASUNTO_NOTA_CREDITO = "Nota de crédito Lavado de Autos - Zplash";

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

// Manda el PDF de la factura (o de la nota de crédito que la anuló, con
// `notaCreditoDe`) al correo del contacto de la empresa (Empresas → persona de
// contacto). Si la empresa no está registrada o su contacto no tiene correo,
// cae al correo de la compra web o de la ficha del cliente.
export async function mandarFacturaPorCorreo(
  folio: number,
  ventas: Venta[],
  { soloFicha, notaCreditoDe }: OpcionesFactura & { notaCreditoDe?: number } = {}
): Promise<ResultadoCorreoFactura> {
  const clientes = await clientesDe(ventas);
  const v0 = ventas[0];
  const rut = (!soloFicha && v0.rut) || clientes.get(v0.clienteId)?.rut;
  const empresa = rut ? await empresaPorRut(rut) : null;
  const contacto = empresa?.contactoClienteId ? (await getClientesByIds([empresa.contactoClienteId]))[0] : undefined;
  const email = [contacto?.email, soloFicha ? undefined : v0.email, clientes.get(v0.clienteId)?.email].find((e) => esEmailEnviable(e))?.trim();
  if (!email) return { ok: false, error: "la empresa no tiene correo de contacto" };

  let pdf: Buffer;
  try {
    pdf = await pdfFactura(folio, notaCreditoDe ? 61 : 33);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const total = ventas.reduce((s, v) => s + v.precio, 0);
  const razonSocial = empresa?.razonSocial || (!soloFicha && v0.razonSocial) || clientes.get(v0.clienteId)?.razonSocial || "";
  const html = envolverHtmlBase(
    `<p style="margin:0 0 16px;">Hola${razonSocial ? ` <strong>${escapeHtml(razonSocial)}</strong>` : ""},</p>` +
      (notaCreditoDe
        ? `<p style="margin:0 0 16px;">Adjuntamos la nota de crédito electrónica N° <strong>${folio}</strong> por ${fmtCLP(total)}, que anula la factura N° ${notaCreditoDe}.</p>`
        : `<p style="margin:0 0 16px;">Adjuntamos la factura electrónica N° <strong>${folio}</strong> por ${fmtCLP(total)}.</p>`) +
      `<p style="margin:0 0 16px;">Gracias por preferir Zplash.</p>`,
    { boton: false }
  );
  const r = await enviarCorreoTransaccional({
    to: email,
    subject: notaCreditoDe ? ASUNTO_NOTA_CREDITO : ASUNTO_FACTURA,
    html,
    adjuntos: [{ nombre: `${notaCreditoDe ? "Nota-de-credito" : "Factura"}-${folio}.pdf`, contenido: pdf }],
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

// Nota de crédito que anula completa una factura emitida por SimpleFactura.
// Las ventas quedan como estaban (facturadas, con su folio) y llevan el folio
// de la nota: no vuelven a quedar pendientes de factura.
export async function emitirNotaCreditoDeFactura(facturaFolio: number, motivo: MotivoNotaCredito, glosa: string): Promise<ResultadoNotaCredito> {
  if (!Object.hasOwn(MOTIVOS_NOTA_CREDITO, motivo)) return { ok: false, error: "Motivo inválido" };
  const ventas = await ventasPorFolio(facturaFolio);
  if (!ventas.length) return { ok: false, error: `No hay ventas con la factura N° ${facturaFolio}` };
  const previa = ventas.find((v) => v.notaCreditoFolio !== undefined)?.notaCreditoFolio;
  if (previa) return { ok: false, error: `La factura N° ${facturaFolio} ya está anulada por la nota de crédito N° ${previa}` };
  if (previa === 0) return { ok: false, error: `Ya hay una nota de crédito en curso o sin confirmar para la factura N° ${facturaFolio}: revísela en SimpleFactura` };

  let factura: Awaited<ReturnType<typeof datosFactura>>;
  try {
    factura = await datosFactura(facturaFolio);
  } catch (e) {
    return { ok: false, motivo: "transitorio", error: e instanceof Error ? e.message : String(e) };
  }
  // La nota anula el monto exacto de la factura: si las ventas ya no suman
  // eso (se editó un precio después), las líneas no cuadrarían.
  const total = ventas.reduce((s, v) => s + v.precio, 0);
  if (total !== factura.total) {
    return { ok: false, error: `Las ventas suman ${fmtCLP(total)} y la factura N° ${facturaFolio} fue por ${fmtCLP(factura.total)}: emita la nota en SimpleFactura` };
  }

  // Giro y dirección salen de la venta (compra web) o de la ficha, igual que
  // emitirFacturaDeVentas. RUT y razón social, de la factura tal como quedó en
  // el SII: si después se corrigió el RUT en la ficha (justo el caso de
  // anular por "RUT equivocado"), la nota igual tiene que ir al RUT anulado.
  const clientes = await clientesDe(ventas);
  const receptor = receptorDe(ventas[0], clientes);
  if (/^\d{6,8}-[\dkK]$/.test(factura.rutReceptor.replace(/\./g, ""))) {
    receptor.rut = factura.rutReceptor;
    receptor.razonSocial = factura.razonSocialReceptor || receptor.razonSocial;
  }
  const empresa = receptor.rut ? await empresaPorRut(receptor.rut) : null;
  receptor.comuna = empresa?.comuna;
  receptor.ciudad = empresa?.ciudad;
  const falta = [!receptor.rut && "RUT", !receptor.razonSocial && "razón social", !receptor.giro && "giro", !receptor.direccion?.trim() && "dirección"].filter(Boolean);
  if (falta.length) return { ok: false, error: `Faltan datos de facturación: ${falta.join(", ")}` };

  if (!(await reservarNotaCredito(facturaFolio))) return { ok: false, error: `La factura N° ${facturaFolio} ya tiene una nota de crédito en curso` };
  const razon = [MOTIVOS_NOTA_CREDITO[motivo], glosa.trim()].filter(Boolean).join(": ");
  let folio: number;
  try {
    folio = await emitirNotaCredito(ventas, receptor, diaCaja(new Date().toISOString()), { folio: facturaFolio, fecha: factura.fecha, razon }, motivo);
  } catch (e) {
    const motivoFallo: MotivoFalloFactura = e instanceof ErrorFactura ? e.motivo : "incierto";
    const error = e instanceof Error ? e.message : String(e);
    if (motivoFallo === "incierto") {
      // Queda reservada (folio 0): liberarla dejaría emitir otra nota encima.
      console.error("Nota de crédito sin confirmar: revisar en SimpleFactura", facturaFolio, error);
      return { ok: false, motivo: motivoFallo, error: `${error}. No se sabe si la nota de crédito alcanzó a emitirse: revísela en SimpleFactura antes de volver a intentarlo.` };
    }
    await marcarNotaCredito(facturaFolio, null);
    return { ok: false, motivo: motivoFallo, error };
  }
  if (!(await marcarNotaCredito(facturaFolio, folio))) {
    return { ok: false, error: `Se emitió la nota de crédito N° ${folio} pero no se pudo guardar su folio en la base.` };
  }
  return { ok: true, folio, correo: await mandarFacturaPorCorreo(folio, ventas, { notaCreditoDe: facturaFolio }) };
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
    // El operador eligió otra empresa para esta venta (PagoModal): no se
    // emite sola a la de la ficha. Queda pendiente en el Cierre, donde alguien
    // con permiso de facturar la revisa y la emite a la que corresponde.
    if (opciones.soloFicha && v.rut && formatRut(v.rut) !== formatRut(rut)) continue;
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
