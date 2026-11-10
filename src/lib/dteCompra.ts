// Lectura de los XML de documentos tributarios electrónicos (DTE) que los
// proveedores mandan a facturascompra@zplash.cl, y reglas para pasarlos a la
// contabilidad. Sin dependencias de servidor: la pestaña Facturas de compra
// usa las constantes y egresoDesdeDocumento en el navegador.
//
// El XML de intercambio es un <EnvioDTE> con uno o más <DTE>, cada uno con su
// <Documento><Encabezado>…</Encabezado><Detalle>…</Detalle></Documento>
// (formato del SII). Se lee con expresiones regulares y no con un parser XML
// porque el formato es fijo y no hay ninguna librería XML en el proyecto; los
// prefijos de namespace se toleran por si algún emisor los usa.

import { limpiarRut } from "@/lib/helpers/validadores";
import type {
  DocumentoCompra,
  ItemDocumentoCompra,
  MovimientoContable,
} from "@/types";

export const TIPOS_DTE: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  39: "Boleta",
  41: "Boleta exenta",
  43: "Liquidación factura",
  46: "Factura de compra",
  52: "Guía de despacho",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export const nombreTipoDte = (tipo: number) => TIPOS_DTE[tipo] || `DTE ${tipo}`;

/** La guía de despacho no es un cobro: documenta el traslado de mercadería y
 * la factura llega aparte. Se guarda pero entra como ignorada. */
export const esDocumentoSinMonto = (tipo: number) => tipo === 52;

/** Nota de crédito: el egreso que genera va en negativo (rebaja lo que se
 * le debe o se le pagó al proveedor). */
export const esNotaCredito = (tipo: number) => tipo === 61;

export const esBoleta = (tipo: number) => tipo === 39 || tipo === 41;

/** Marca en las notas del egreso que lo creó la pestaña Facturas de compra
 * (no hay columna propia en movimientos_contables). */
export const PREFIJO_NOTA_EGRESO = "Desde Facturas de compra.";
export const esEgresoDeFacturaCompra = (m: { notas?: string }) =>
  !!m.notas?.startsWith(PREFIJO_NOTA_EGRESO);

/** Categorías para compras de activo fijo. No van a categorias_gasto a
 * propósito: esa tabla alimenta el EERR (cada grupo es un renglón de
 * resultados) y un activo no es gasto del período. */
export const CATEGORIAS_ACTIVO = [
  "Maquinaria y equipos",
  "Vehículos",
  "Muebles y útiles",
  "Equipos computacionales",
  "Obras e instalaciones",
  "Otros activos fijos",
] as const;

export interface DteParseado {
  id: string;
  tipoDte: number;
  folio: number;
  fechaEmision: string;
  fechaVencimiento?: string;
  rutEmisor: string;
  razonSocialEmisor: string;
  giroEmisor?: string;
  rutReceptor: string;
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
  detalle: ItemDocumentoCompra[];
  xml: string;
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodificarEntidades(s: string): string {
  return s.replace(
    /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g,
    (m, e: string) => {
      if (e[0] !== "#") return ENTIDADES[e] ?? m;
      const cp =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    },
  );
}

function bloques(xml: string, nombre: string): string[] {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`,
    "g",
  );
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function bloquesCompletos(xml: string, nombre: string): string[] {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w-]+:)?${nombre}>`,
    "g",
  );
  return [...xml.matchAll(re)].map((m) => m[0]);
}

function valor(xml: string, nombre: string): string | undefined {
  const b = bloques(xml, nombre)[0];
  if (b === undefined) return undefined;
  const v = decodificarEntidades(
    b.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
  ).trim();
  return v || undefined;
}

const numero = (s?: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const normalizarRut = (rut: string) =>
  rut.replace(/\./g, "").replace(/\s/g, "").toUpperCase();

/** Pasa los bytes del adjunto a texto respetando la codificación que declara
 * el propio XML (los DTE del SII vienen casi siempre en ISO-8859-1). */
export function decodificarXml(bytes: Uint8Array): string {
  const cabecera = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const declarada = /encoding=["']([\w-]+)["']/i
    .exec(cabecera)?.[1]
    ?.toLowerCase();
  const utf8 = !declarada || declarada === "utf-8" || declarada === "utf8";
  // Postgres rechaza el carácter NUL en text: se quita para que un XML raro
  // no impida guardar el documento.
  return new TextDecoder(utf8 ? "utf-8" : "latin1")
    .decode(bytes)
    .replace(/\u0000/g, "");
}

/** Todos los DTE de un XML de intercambio. Un XML que no trae DTE (acuse de
 * recibo, respuesta de aceptación, resultado del SII) devuelve []. */
export function parsearDtes(xml: string): DteParseado[] {
  const out: DteParseado[] = [];
  for (const dte of bloquesCompletos(xml, "DTE")) {
    const enc = bloques(dte, "Encabezado")[0];
    if (!enc) continue;
    const idDoc = bloques(enc, "IdDoc")[0] ?? "";
    const emisor = bloques(enc, "Emisor")[0] ?? "";
    const receptor = bloques(enc, "Receptor")[0] ?? "";
    const totales = bloques(enc, "Totales")[0] ?? "";
    const tipoDte = numero(valor(idDoc, "TipoDTE"));
    const folio = numero(valor(idDoc, "Folio"));
    const rutEmisor = normalizarRut(valor(emisor, "RUTEmisor") ?? "");
    if (!tipoDte || !folio || !rutEmisor) continue;
    const detalle: ItemDocumentoCompra[] = bloques(dte, "Detalle").map((d) => {
      const cantidad = valor(d, "QtyItem");
      const precio = valor(d, "PrcItem");
      return {
        nombre:
          valor(d, "NmbItem") ?? valor(d, "DscItem") ?? "(sin descripción)",
        ...(cantidad ? { cantidad: numero(cantidad) } : {}),
        ...(precio ? { precio: numero(precio) } : {}),
        monto: numero(valor(d, "MontoItem")),
      };
    });
    out.push({
      id: `${rutEmisor}-${tipoDte}-${folio}`,
      tipoDte,
      folio,
      fechaEmision: valor(idDoc, "FchEmis") ?? "",
      fechaVencimiento: valor(idDoc, "FchVenc"),
      rutEmisor,
      // RznSoc en facturas; RznSocEmisor en boletas.
      razonSocialEmisor:
        valor(emisor, "RznSoc") ?? valor(emisor, "RznSocEmisor") ?? rutEmisor,
      giroEmisor: valor(emisor, "GiroEmis") ?? valor(emisor, "GiroEmisor"),
      rutReceptor: normalizarRut(valor(receptor, "RUTRecep") ?? ""),
      montoNeto: numero(valor(totales, "MntNeto")),
      montoExento: numero(valor(totales, "MntExe")),
      iva: numero(valor(totales, "IVA")),
      montoTotal: numero(valor(totales, "MntTotal")),
      detalle,
      xml: dte,
    });
  }
  return out;
}

/** Egreso de Contabilidad que corresponde a un documento clasificado como
 * gasto. El monto va con IVA, igual que los egresos que se cargan a mano (es
 * lo que se le paga al proveedor y lo que muestra Cuentas por Pagar); la nota
 * de crédito va en negativo. Queda "pendiente_pago" hasta que se pague. */
export function egresoDesdeDocumento(
  doc: DocumentoCompra,
  categoria: string,
  id: string,
  usuario: string | undefined,
  ahora: string,
): MovimientoContable {
  const signo = esNotaCredito(doc.tipoDte) ? -1 : 1;
  const primerItem = doc.detalle[0]?.nombre;
  // Un XML sin FchEmis válida cae a la fecha en que llegó el correo.
  const emision = /^\d{4}-\d{2}-\d{2}$/.test(doc.fechaEmision)
    ? new Date(`${doc.fechaEmision}T12:00:00-03:00`)
    : new Date(doc.recibidoEn);
  return {
    id,
    tipo: "egreso",
    fecha: (Number.isNaN(emision.getTime())
      ? new Date(ahora)
      : emision
    ).toISOString(),
    descripcion:
      `${nombreTipoDte(doc.tipoDte)} ${doc.folio} ${doc.razonSocialEmisor}${primerItem ? ` — ${primerItem}` : ""}`.slice(
        0,
        200,
      ),
    categoria,
    contraparte: doc.razonSocialEmisor,
    rutProveedor: doc.rutEmisor,
    numeroFactura: String(doc.folio),
    tipoDocumento: esBoleta(doc.tipoDte) ? "Boleta" : "Factura",
    monto: signo * doc.montoTotal,
    estado: "pendiente_pago",
    notas: `${PREFIJO_NOTA_EGRESO} Neto ${doc.montoNeto}, exento ${doc.montoExento}, IVA ${doc.iva}.`,
    creadoEn: ahora,
    creadoPor: usuario,
  };
}

/** Egreso ya cargado a mano que corresponde al mismo documento (mismo RUT de
 * proveedor, mismo N° y mismo tipo boleta/factura): se vincula en vez de
 * crear otro, para no contar dos veces el mismo gasto. Los egresos que creó
 * esta pestaña quedan fuera: pertenecen a otro documento (p. ej. una nota de
 * crédito con el mismo N°), y el propio ya viene en movimientoContableId. */
export function egresoExistente(
  doc: DocumentoCompra,
  movimientos: MovimientoContable[],
): MovimientoContable | undefined {
  // Los folios de nota de crédito son otra serie: el N° puede coincidir con
  // el de una factura del mismo proveedor sin ser el mismo documento.
  if (esNotaCredito(doc.tipoDte)) return undefined;
  const rut = limpiarRut(doc.rutEmisor);
  const tipo = esBoleta(doc.tipoDte) ? "Boleta" : "Factura";
  return movimientos.find(
    (m) =>
      m.tipo === "egreso" &&
      !esEgresoDeFacturaCompra(m) &&
      (m.tipoDocumento ?? "Factura") === tipo &&
      limpiarRut(m.rutProveedor) === rut &&
      String(m.numeroFactura ?? "").replace(/\D/g, "") === String(doc.folio),
  );
}
