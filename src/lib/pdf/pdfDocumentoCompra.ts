import { pdfTexto, type LineaPdf } from "@/lib/pdf/pdfTexto";
import { esNotaCredito, nombreTipoDte } from "@/lib/dteCompra";
import { fmtCLP, formatRut } from "@/lib/helpers";
import type { DocumentoCompra } from "@/types";

// PDF de una factura de compra armado con los datos de su XML (pestaña
// Facturas de compra). No es la representación impresa oficial del proveedor
// (no lleva timbre electrónico): sirve para leerla, archivarla o mandarla.

const MAX_ITEMS = 25;

const fecha = (f: string) => f.split("-").reverse().join("-");

export function pdfDocumentoCompra(d: DocumentoCompra): Buffer {
  const titulo = `${nombreTipoDte(d.tipoDte)} N° ${d.folio}`;
  const signo = esNotaCredito(d.tipoDte) ? -1 : 1;
  const items = d.detalle.slice(0, MAX_ITEMS);
  const lineas: LineaPdf[] = [
    { texto: d.razonSocialEmisor, tamano: 16, negrita: true },
    { texto: `RUT ${formatRut(d.rutEmisor)}`, tamano: 10, gris: 0.4, antes: 2 },
    ...(d.giroEmisor ? [{ texto: d.giroEmisor, tamano: 9, gris: 0.4 }] : []),
    { texto: titulo.toUpperCase(), tamano: 13, negrita: true, antes: 16 },
    { texto: "Fecha de emisión", valor: fecha(d.fechaEmision), antes: 8 },
    ...(d.fechaVencimiento
      ? [{ texto: "Fecha de vencimiento", valor: fecha(d.fechaVencimiento), antes: 2 }]
      : []),
    { texto: "Receptor", valor: "ZPlash", antes: 2 },
    { texto: "DETALLE", tamano: 9, gris: 0.5, antes: 16 },
    ...items.map((i, n) => ({
      texto: fmtCLP(i.monto),
      valor: `${i.nombre}${i.cantidad ? ` (${i.cantidad} × ${fmtCLP(i.precio ?? 0)})` : ""}`,
      antes: n === 0 ? 4 : 2,
    })),
    ...(d.detalle.length > items.length
      ? [{ texto: `… y ${d.detalle.length - items.length} línea(s) más (ver XML)`, tamano: 9, gris: 0.5, antes: 4 }]
      : []),
    { texto: "Neto", valor: fmtCLP(signo * d.montoNeto), antes: 16 },
    { texto: "Exento", valor: fmtCLP(signo * d.montoExento), antes: 2 },
    { texto: "IVA", valor: fmtCLP(signo * d.iva), antes: 2 },
    { texto: "Total", valor: fmtCLP(signo * d.montoTotal), negrita: true, antes: 2 },
    {
      texto: "Documento armado desde el XML recibido en facturascompra@zplash.cl; no reemplaza la representación impresa con timbre del proveedor.",
      tamano: 8,
      gris: 0.5,
      antes: 24,
    },
  ];
  return pdfTexto(lineas, `${titulo} ${d.razonSocialEmisor}`);
}
