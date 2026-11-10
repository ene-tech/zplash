import { describe, expect, it } from "vitest";
import {
  decodificarXml,
  egresoDesdeDocumento,
  egresoExistente,
  parsearDtes,
} from "./dteCompra";
import type { DocumentoCompra, MovimientoContable } from "@/types";

const ENVIO = `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
 <SetDTE ID="SetDoc">
  <Caratula version="1.0"><RutEmisor>76123456-7</RutEmisor><RutReceptor>77777777-K</RutReceptor></Caratula>
  <DTE version="1.0">
   <Documento ID="F120T33">
    <Encabezado>
     <IdDoc><TipoDTE>33</TipoDTE><Folio>120</Folio><FchEmis>2026-11-05</FchEmis><FchVenc>2026-12-05</FchVenc></IdDoc>
     <Emisor><RUTEmisor>76.123.456-7</RUTEmisor><RznSoc>Químicos &amp; Ceras SpA</RznSoc><GiroEmis>Venta de insumos</GiroEmis></Emisor>
     <Receptor><RUTRecep>77777777-k</RUTRecep><RznSocRecep>Zplash</RznSocRecep></Receptor>
     <Totales><MntNeto>100000</MntNeto><TasaIVA>19</TasaIVA><IVA>19000</IVA><MntTotal>119000</MntTotal></Totales>
    </Encabezado>
    <Detalle><NroLinDet>1</NroLinDet><NmbItem>Shampoo 20 L</NmbItem><QtyItem>2</QtyItem><PrcItem>50000</PrcItem><MontoItem>100000</MontoItem></Detalle>
   </Documento>
  </DTE>
  <DTE version="1.0">
   <Documento ID="F9T61">
    <Encabezado>
     <IdDoc><TipoDTE>61</TipoDTE><Folio>9</Folio><FchEmis>2026-11-06</FchEmis></IdDoc>
     <Emisor><RUTEmisor>76123456-7</RUTEmisor><RznSoc>Químicos &amp; Ceras SpA</RznSoc></Emisor>
     <Receptor><RUTRecep>77777777-K</RUTRecep></Receptor>
     <Totales><MntExe>5000</MntExe><MntTotal>5000</MntTotal></Totales>
    </Encabezado>
    <Detalle><NmbItem>Descuento</NmbItem><MontoItem>5000</MontoItem></Detalle>
   </Documento>
  </DTE>
 </SetDTE>
</EnvioDTE>`;

describe("parsearDtes", () => {
  it("lee cada DTE del envío con sus totales y detalle", () => {
    const [f, nc] = parsearDtes(ENVIO);
    expect(f).toMatchObject({
      id: "76123456-7-33-120",
      tipoDte: 33,
      folio: 120,
      fechaEmision: "2026-11-05",
      fechaVencimiento: "2026-12-05",
      rutEmisor: "76123456-7",
      razonSocialEmisor: "Químicos & Ceras SpA",
      giroEmisor: "Venta de insumos",
      rutReceptor: "77777777-K",
      montoNeto: 100000,
      iva: 19000,
      montoTotal: 119000,
      detalle: [
        { nombre: "Shampoo 20 L", cantidad: 2, precio: 50000, monto: 100000 },
      ],
    });
    expect(f.xml.startsWith("<DTE")).toBe(true);
    expect(nc).toMatchObject({
      id: "76123456-7-61-9",
      tipoDte: 61,
      montoExento: 5000,
      montoTotal: 5000,
      montoNeto: 0,
    });
  });

  it("un acuse de recibo o respuesta sin DTE no devuelve nada", () => {
    expect(
      parsearDtes(
        `<?xml version="1.0"?><RespuestaDTE><Resultado><RecepcionEnvio/></Resultado></RespuestaDTE>`,
      ),
    ).toEqual([]);
  });

  it("tolera prefijos de namespace", () => {
    const conPrefijo = ENVIO.replace(/<(\/?)(\w+)/g, "<$1sii:$2");
    expect(parsearDtes(conPrefijo).map((d) => d.id)).toEqual([
      "76123456-7-33-120",
      "76123456-7-61-9",
    ]);
  });
});

describe("decodificarXml", () => {
  it("respeta ISO-8859-1 declarado en el XML", () => {
    const bytes = Uint8Array.from(
      Buffer.from(
        `<?xml version="1.0" encoding="ISO-8859-1"?><a>Químicos</a>`,
        "latin1",
      ),
    );
    expect(decodificarXml(bytes)).toContain("Químicos");
  });
  it("sin declaración asume UTF-8", () => {
    expect(decodificarXml(new TextEncoder().encode("<a>Químicos</a>"))).toBe(
      "<a>Químicos</a>",
    );
  });
});

const doc = (p: Partial<DocumentoCompra> = {}): DocumentoCompra => ({
  id: "76123456-7-33-120",
  tipoDte: 33,
  folio: 120,
  fechaEmision: "2026-11-05",
  rutEmisor: "76123456-7",
  razonSocialEmisor: "Químicos SpA",
  montoNeto: 100000,
  montoExento: 0,
  iva: 19000,
  montoTotal: 119000,
  detalle: [{ nombre: "Shampoo", monto: 100000 }],
  recibidoEn: "2026-11-05T15:00:00Z",
  estado: "pendiente",
  ...p,
});

describe("egresoDesdeDocumento", () => {
  it("arma el egreso pendiente de pago por el total con IVA", () => {
    const e = egresoDesdeDocumento(
      doc(),
      "Insumos de Lavado",
      "mc1",
      "Ana",
      "2026-11-10T00:00:00Z",
    );
    expect(e).toMatchObject({
      tipo: "egreso",
      categoria: "Insumos de Lavado",
      rutProveedor: "76123456-7",
      numeroFactura: "120",
      monto: 119000,
      estado: "pendiente_pago",
      fecha: "2026-11-05T15:00:00.000Z",
    });
  });
  it("la nota de crédito va en negativo", () => {
    expect(
      egresoDesdeDocumento(
        doc({ tipoDte: 61 }),
        "Insumos de Lavado",
        "mc1",
        undefined,
        "x",
      ).monto,
    ).toBe(-119000);
  });
});

describe("egresoExistente", () => {
  const mov = (p: Partial<MovimientoContable>): MovimientoContable => ({
    id: "m1",
    tipo: "egreso",
    fecha: "2026-11-05",
    descripcion: "x",
    monto: 119000,
    estado: "pagado_cc",
    creadoEn: "x",
    ...p,
  });
  it("encuentra el egreso cargado a mano con el mismo RUT y N° (RUT con puntos)", () => {
    expect(
      egresoExistente(doc(), [
        mov({ rutProveedor: "76.123.456-7", numeroFactura: "120" }),
      ])?.id,
    ).toBe("m1");
  });
  it("no vincula un egreso creado desde la pestaña para otro documento, ni una boleta con el mismo N°", () => {
    const deNotaCredito = mov({
      rutProveedor: "76123456-7",
      numeroFactura: "120",
      monto: -5000,
      notas: "Desde Facturas de compra. Neto 0",
    });
    expect(egresoExistente(doc(), [deNotaCredito])).toBeUndefined();
    expect(
      egresoExistente(doc(), [
        mov({
          rutProveedor: "76123456-7",
          numeroFactura: "120",
          tipoDocumento: "Boleta",
        }),
      ]),
    ).toBeUndefined();
    expect(
      egresoExistente(doc({ tipoDte: 39 }), [
        mov({
          rutProveedor: "76123456-7",
          numeroFactura: "120",
          tipoDocumento: "Boleta",
        }),
      ])?.id,
    ).toBe("m1");
  });
  it("sin fecha de emisión válida usa la fecha en que llegó; la boleta queda como Boleta", () => {
    const e = egresoDesdeDocumento(
      doc({ fechaEmision: "", tipoDte: 39 }),
      "Aseo",
      "mc1",
      undefined,
      "2026-11-10T00:00:00.000Z",
    );
    expect(e.fecha).toBe("2026-11-05T15:00:00.000Z");
    expect(e.tipoDocumento).toBe("Boleta");
  });
  it("no vincula otro folio ni una nota de crédito", () => {
    expect(
      egresoExistente(doc(), [
        mov({ rutProveedor: "76123456-7", numeroFactura: "121" }),
      ]),
    ).toBeUndefined();
    expect(
      egresoExistente(doc({ tipoDte: 61 }), [
        mov({ rutProveedor: "76123456-7", numeroFactura: "120" }),
      ]),
    ).toBeUndefined();
  });
});
