import { describe, expect, it } from "vitest";
import type { Venta } from "@/types";
import { armarFactura } from "./simplefactura";

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
});
