import "server-only";

import type { MotivoNotaCredito } from "@/lib/logic/empresas";
import type { Venta } from "@/types";

// Emisión de facturas electrónicas (DTE 33) vía SimpleFactura
// (https://documentacion.simplefactura.cl). El ambiente (certificación o
// producción) lo define la cuenta en el portal, no el request.

const API = "https://api.simplefactura.cl";

export interface ReceptorFactura {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  email?: string;
}

// ponytail: cache por instancia del server. SimpleFactura da 10 tokens por
// hora por usuario; con ~100 facturas al mes alcanza de sobra. Si se pasa,
// guardar el token en la base.
let tokenCache: { token: string; vence: number } | null = null;

async function token(): Promise<string> {
  if (tokenCache && tokenCache.vence > Date.now()) return tokenCache.token;
  const res = await fetch(`${API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // trim: un espacio o salto de línea pegado en Vercel da 401 sin más pista.
    body: JSON.stringify({ email: process.env.SIMPLEFACTURA_EMAIL?.trim(), password: process.env.SIMPLEFACTURA_PASSWORD?.trim() }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.accessToken) throw new Error(`SimpleFactura no entregó token (${res.status}): ${json?.message ?? ""}`);
  // Vence a las 24 h; se renueva una hora antes.
  tokenCache = { token: json.accessToken, vence: Date.now() + (json.expiresIn - 3600) * 1000 };
  return tokenCache.token;
}

// SimpleFactura no completa el emisor desde la cuenta: el SII exige estos
// campos en el XML y en este orden (RUTEmisor, RznSoc, GiroEmis, Acteco...).
const EMISOR = {
  RznSoc: "Servicio e Inversiones Las Aguilas Spa",
  GiroEmis: "Lavado de vehículos",
  Acteco: [452001],
  DirOrigen: "Prieto Norte 71",
  CmnaOrigen: "Temuco",
  CiudadOrigen: "Temuco",
};

/** Arma el JSON de invoiceV2 para una factura afecta. Los precios de las
 * ventas ya traen IVA, por eso va MntBruto=1 y el neto se despeja del total. */
export function armarFactura(ventas: Venta[], receptor: ReceptorFactura, fecha: string, rutEmisor: string) {
  const total = ventas.reduce((s, v) => s + v.precio, 0);
  const neto = Math.round(total / 1.19);
  const pagada = ventas.every((v) => !v.estadoPago || v.estadoPago === "pagado");
  // Comuna y ciudad salen de la ficha de la empresa. Sin empresa registrada
  // (compra web, cliente con factura) se toma lo que venga después de la
  // última coma de la dirección ("Av. X 123, Las Condes"); sin coma, el SII
  // igual exige comuna: se usa la del local, donde están casi todos.
  const comuna = receptor.comuna?.trim() || (receptor.direccion?.includes(",") && receptor.direccion.split(",").pop()!.trim()) || "Temuco";
  return {
    Documento: {
      Encabezado: {
        IdDoc: { TipoDTE: 33, FchEmis: fecha, FmaPago: pagada ? 1 : 2, MntBruto: 1 },
        Emisor: { RUTEmisor: rutEmisor, ...EMISOR },
        Receptor: {
          RUTRecep: receptor.rut.replace(/\./g, "").toUpperCase(),
          RznSocRecep: receptor.razonSocial.slice(0, 100),
          GiroRecep: receptor.giro.slice(0, 40),
          DirRecep: receptor.direccion?.slice(0, 70),
          CmnaRecep: comuna.slice(0, 20),
          // Sin esto el PDF imprime "Sin ciudad". Casi todos los clientes son de Temuco.
          CiudadRecep: (receptor.ciudad?.trim() || "Temuco").slice(0, 20),
          CorreoRecep: receptor.email,
        },
        Totales: { MntNeto: neto, TasaIVA: 19, IVA: total - neto, MntTotal: total },
      },
      Detalle: ventas.map((v, i) => ({
        NroLinDet: i + 1,
        NmbItem: nombreItem(v).slice(0, 80),
        DscItem: v.fecha.slice(0, 10),
        QtyItem: 1,
        PrcItem: v.precio,
        MontoItem: v.precio,
      })),
    },
  };
}

/** Nombre de la línea en la factura. Una venta contra orden de compra lleva el
 * producto (el nombre del lote: "10 lavados") seguido de su referencia, para
 * que la factura diga de qué OC nace. */
function nombreItem(v: Venta): string {
  if (!v.ordenCompra) return [v.tipo, v.patente].filter(Boolean).join(" - ");
  const producto = v.nombre.replace(/^Venta Empresa · /, "") || v.tipo;
  return `${producto} Referencia: ${v.ordenCompra}`;
}

/** Por qué no salió una factura, para saber si se puede volver a intentar:
 * - "rechazo": SimpleFactura contestó que no (datos, folios). No hay factura.
 * - "transitorio": falló antes de mandar la factura (token, 429). No hay factura.
 * - "incierto": la factura se mandó y no hubo respuesta legible (timeout, red,
 *   5xx). El SII pudo haberle asignado folio: reintentar puede duplicarla. */
export type MotivoFalloFactura = "rechazo" | "transitorio" | "incierto";
export class ErrorFactura extends Error {
  constructor(message: string, readonly motivo: MotivoFalloFactura) {
    super(message);
  }
}

const TIMEOUT_EMISION_MS = 30_000;

/** Emite la factura y devuelve el folio asignado por el SII. Falla con ErrorFactura. */
export async function emitirFactura(ventas: Venta[], receptor: ReceptorFactura, fecha: string): Promise<number> {
  return emitirDte("invoiceV2", (rutEmisor) => armarFactura(ventas, receptor, fecha, rutEmisor));
}

export interface FacturaReferida {
  folio: number;
  fecha: string; // AAAA-MM-DD, la de emisión de la factura
  razon: string;
}

/** Nota de crédito (DTE 61) que anula completa una factura (CodRef 1): las
 * mismas líneas y montos de la factura, más la referencia a ella. */
export function armarNotaCredito(ventas: Venta[], receptor: ReceptorFactura, fecha: string, rutEmisor: string, factura: FacturaReferida) {
  const dte = armarFactura(ventas, receptor, fecha, rutEmisor);
  dte.Documento.Encabezado.IdDoc.TipoDTE = 61;
  return {
    Documento: {
      ...dte.Documento,
      Referencia: [{ NroLinRef: 1, TpoDocRef: "33", FolioRef: String(factura.folio), FchRef: factura.fecha, CodRef: 1, RazonRef: factura.razon.slice(0, 90) }],
    },
  };
}

/** Emite la nota de crédito que anula la factura y devuelve su folio. Falla con ErrorFactura. */
export async function emitirNotaCredito(ventas: Venta[], receptor: ReceptorFactura, fecha: string, factura: FacturaReferida, motivo: MotivoNotaCredito): Promise<number> {
  return emitirDte("invoiceCreditDebitNotesV2", (rutEmisor) => armarNotaCredito(ventas, receptor, fecha, rutEmisor, factura), `/${motivo}`);
}

async function emitirDte(endpoint: string, armar: (rutEmisor: string) => unknown, sufijo = ""): Promise<number> {
  const rutEmisor = process.env.SIMPLEFACTURA_RUT_EMISOR;
  if (!rutEmisor || !process.env.SIMPLEFACTURA_EMAIL || !process.env.SIMPLEFACTURA_PASSWORD) {
    throw new ErrorFactura("Falta configurar SimpleFactura (SIMPLEFACTURA_EMAIL, SIMPLEFACTURA_PASSWORD, SIMPLEFACTURA_RUT_EMISOR)", "rechazo");
  }
  const sucursal = (process.env.SIMPLEFACTURA_SUCURSAL || "Casa Matriz").replace(/ /g, "_");
  let bearer: string;
  try {
    bearer = await token();
  } catch (e) {
    throw new ErrorFactura(e instanceof Error ? e.message : String(e), "transitorio");
  }
  let res: Response;
  try {
    res = await fetch(`${API}/${endpoint}/${encodeURIComponent(sucursal)}${sufijo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(armar(rutEmisor)),
      signal: AbortSignal.timeout(TIMEOUT_EMISION_MS),
    });
  } catch (e) {
    throw new ErrorFactura(`SimpleFactura no respondió: ${e instanceof Error ? e.message : String(e)}`, "incierto");
  }
  const json = await res.json().catch(() => null);
  const folio = json?.data?.folio;
  if (res.ok && typeof folio === "number") return folio;
  const mensaje = json?.errors?.join("; ") || json?.message || `SimpleFactura respondió ${res.status}`;
  if (res.status === 429) throw new ErrorFactura(mensaje, "transitorio");
  // Sin folios no hay documento, venga con el status que venga (la nota de
  // crédito sin CAF del tipo 61 volvió así, oct-2026, y quedó trabada).
  if (json && esSinFolios(mensaje)) throw new ErrorFactura(mensaje, "rechazo");
  // 4xx con error legible = rechazo; un 2xx sin folio, un 5xx o una respuesta
  // ilegible no dicen si el folio se asignó.
  throw new ErrorFactura(mensaje, res.status >= 400 && res.status < 500 && json ? "rechazo" : "incierto");
}

/** "No hay suficientes folios disponibles…" / "no tiene timbrajes". */
export function esSinFolios(mensaje: string): boolean {
  return /folios disponibles|timbraje/i.test(mensaje);
}

function referenciaDte(folio: number, codigoTipoDte: number) {
  const rutEmisor = process.env.SIMPLEFACTURA_RUT_EMISOR;
  if (!rutEmisor) throw new Error("Falta configurar SIMPLEFACTURA_RUT_EMISOR");
  return {
    credenciales: { rutEmisor, nombreSucursal: process.env.SIMPLEFACTURA_SUCURSAL || "Casa Matriz" },
    dteReferenciadoExterno: { folio, codigoTipoDte, ambiente: process.env.SIMPLEFACTURA_AMBIENTE === "0" ? 0 : 1 },
  };
}

/** Fecha, total y receptor de una factura tal como quedó en el SII: la nota de
 * crédito se referencia a esa fecha, anula el mismo monto y va al mismo RUT. */
export async function datosFactura(folio: number): Promise<{ fecha: string; total: number; rutReceptor: string; razonSocialReceptor: string }> {
  const res = await fetch(`${API}/documentIssued`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(referenciaDte(folio, 33)),
    signal: AbortSignal.timeout(TIMEOUT_EMISION_MS),
  });
  const json = await res.json().catch(() => null);
  const d = json?.data;
  if (!res.ok || typeof d?.total !== "number" || typeof d?.fechaDte !== "string") {
    throw new Error(json?.errors?.join("; ") || json?.message || `SimpleFactura no encontró la factura N° ${folio} (${res.status})`);
  }
  return { fecha: d.fechaDte.slice(0, 10), total: d.total, rutReceptor: String(d.rutReceptor ?? ""), razonSocialReceptor: String(d.razonSocialReceptor ?? "") };
}

/** PDF de una factura (33) o nota de crédito (61) ya emitida, para mandarla
 * por correo. ambiente: 1 = producción, 0 = certificación
 * (SIMPLEFACTURA_AMBIENTE=0 en una cuenta de pruebas); a diferencia de la
 * emisión, este endpoint sí lo pide. */
export async function pdfFactura(folio: number, tipoDte: 33 | 61 = 33): Promise<Buffer> {
  const res = await fetch(`${API}/dte/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(referenciaDte(folio, tipoDte)),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  // Los errores vienen en JSON; el PDF, en binario.
  if (!res.ok || buf.subarray(0, 4).toString() !== "%PDF") {
    const json = (() => {
      try {
        return JSON.parse(buf.toString());
      } catch {
        return null;
      }
    })();
    throw new Error(json?.errors?.join("; ") || json?.message || `SimpleFactura no entregó el PDF (${res.status})`);
  }
  return buf;
}
