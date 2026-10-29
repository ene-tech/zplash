import { describe, expect, it } from "vitest";
import type { Venta } from "@/types";
import { armarFactura, armarNotaCredito, esSinFolios } from "./simplefactura";

const venta = (precio: number, extra: Partial<Venta> = {}): Venta =>
  ({ id: "v", clienteId: "c", patente: "ABCD12", nombre: "", plan: "", precio, tipo: "Renovación", fecha: "2026-10-01T12:00:00Z", ...extra }) as Venta;

const receptor = { rut: "76.123.456-k", razonSocial: "Transportes X", giro: "Transporte", direccion: "Av. Apoquindo 123, Las Condes" };

describe("armarFactura", () => {
  it("despeja neto e IVA del total bruto y cuadra al peso", () => {
    const { Totales } = armarFactura([venta(21990), venta(9990)], receptor, "2026-10-03", "1-9").Documento.Encabezado;
    expect(Totales.MntTotal).toBe(31980);
    expect(Totales.MntNeto + Totales.IVA).toBe(31980);
    expect(Totales.MntNeto).toBe(26874);
  });

  it("normaliza el RUT, saca la comuna de la dirección y marca crédito si hay saldo pendiente", () => {
    const doc = armarFactura([venta(1000, { estadoPago: "pendiente" })], receptor, "2026-10-03", "1-9").Documento;
    expect(doc.Encabezado.Receptor.RUTRecep).toBe("76123456-K");
    expect(doc.Encabezado.Emisor.RznSoc).toBe("Servicio e Inversiones Las Aguilas Spa");
    expect(doc.Encabezado.Receptor.CmnaRecep).toBe("Las Condes");
    expect(doc.Encabezado.IdDoc.FmaPago).toBe(2);
    expect(doc.Detalle[0].NmbItem).toBe("Renovación - ABCD12");
  });

  it("sin coma en la dirección usa Temuco como comuna", () => {
    const doc = armarFactura([venta(1000)], { ...receptor, direccion: "Prieto Norte 71" }, "2026-10-03", "1-9").Documento;
    expect(doc.Encabezado.Receptor.CmnaRecep).toBe("Temuco");
  });

  it("una venta con orden de compra la lleva como referencia 801, no en el detalle", () => {
    const oc = venta(399900, { tipo: "Cupón Venta Empresa", patente: "", nombre: "Venta Empresa · SALFA", cantidadItems: 40, ordenCompra: "OC: 521518" });
    const doc = armarFactura([oc], receptor, "2026-10-03", "1-9").Documento;
    expect(doc.Detalle[0].NmbItem).toBe("40 tickets de lavado de vehículo");
    expect(doc.Referencia).toEqual([{ NroLinRef: 1, TpoDocRef: "801", FolioRef: "521518", FchRef: "2026-10-01" }]);
  });

  it("varias ventas con la misma OC dan una sola referencia; distintas, una cada una", () => {
    const doc = armarFactura([venta(1000, { ordenCompra: "4500" }), venta(1000, { ordenCompra: "OC 4500" }), venta(1000, { ordenCompra: "OC N° 77" })], receptor, "2026-10-03", "1-9").Documento;
    expect(doc.Referencia?.map((r) => r.FolioRef)).toEqual(["4500", "77"]);
  });

  it("un pack de tickets web sin orden de compra solo lleva el detalle y no lleva referencia", () => {
    const web = venta(79990, { tipo: "10 Tickets (Web)", patente: "", cantidadItems: 10 });
    const doc = armarFactura([web], receptor, "2026-10-03", "1-9").Documento;
    expect(doc.Detalle[0].NmbItem).toBe("10 tickets de lavado de vehículo");
    expect(doc.Referencia).toBeUndefined();
  });

  it("usa comuna y ciudad de la empresa antes que la dirección", () => {
    const { Receptor } = armarFactura([venta(1000)], { ...receptor, comuna: "Providencia", ciudad: "Santiago" }, "2026-10-03", "1-9").Documento.Encabezado;
    expect(Receptor.CmnaRecep).toBe("Providencia");
    expect(Receptor.CiudadRecep).toBe("Santiago");
  });

  it("emisor y receptor llevan ciudad Temuco", () => {
    const { Emisor, Receptor } = armarFactura([venta(1000)], receptor, "2026-10-03", "1-9").Documento.Encabezado;
    expect(Emisor.CiudadOrigen).toBe("Temuco");
    expect(Receptor.CiudadRecep).toBe("Temuco");
  });
});

describe("armarNotaCredito", () => {
  it("es un DTE 61 con los montos de la factura y la referencia que la anula", () => {
    const ref = { folio: 120, fecha: "2026-10-20", razon: "Error de digitación: RUT equivocado" };
    const doc = armarNotaCredito([venta(21990), venta(9990)], receptor, "2026-10-27", "1-9", ref).Documento;
    expect(doc.Encabezado.IdDoc.TipoDTE).toBe(61);
    expect(doc.Encabezado.Totales.MntTotal).toBe(31980);
    expect(doc.Detalle).toHaveLength(2);
    expect(doc.Referencia).toEqual([{ NroLinRef: 1, TpoDocRef: "33", FolioRef: "120", FchRef: "2026-10-20", CodRef: 1, RazonRef: "Error de digitación: RUT equivocado" }]);
  });
});

describe("esSinFolios", () => {
  it("reconoce la falta de folios como rechazo (no se emitió nada)", () => {
    expect(esSinFolios("No hay suficientes folios disponibles para emitir los documentos requeridos.Actualmente, solo dispones de 0 folios.")).toBe(true);
    expect(esSinFolios("La empresa no tiene timbrajes")).toBe(true);
    expect(esSinFolios("Error interno del servidor")).toBe(false);
  });
});
