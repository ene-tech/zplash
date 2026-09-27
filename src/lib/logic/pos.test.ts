import { describe, expect, it } from "vitest";
import { armarVentaPos, type DatosVentaPos } from "./pos";

const base: DatosVentaPos = {
  id: "v1",
  fecha: "2026-09-04T15:00:00.000Z",
  lineas: [
    { productoId: "a", cantidad: 2, precioUnitario: 1000 },
    { productoId: "b", cantidad: 1, precioUnitario: 2990 },
  ],
  productos: [
    { id: "a", sku: "SKU-A", detalle: "Producto A" },
    { id: "b", sku: "SKU-B", detalle: "Producto B" },
  ],
  metodoPago: "efectivo",
  creadoPor: "Cajero",
};

describe("armarVentaPos", () => {
  it("arma la venta con total, unidades y líneas snapshot", () => {
    const r = armarVentaPos(base);
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(2 * 1000 + 2990);
    expect(r.venta.cantidadItems).toBe(3);
    expect(r.venta.tipo).toBe("Venta de productos");
    expect(r.venta.estadoPago).toBe("pagado");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ id: "v1-0", ventaId: "v1", sku: "SKU-A", cantidad: 2, precioUnitario: 1000 });
  });

  it("rechaza carrito vacío, cantidades no enteras y precios negativos", () => {
    expect(armarVentaPos({ ...base, lineas: [] })).toHaveProperty("error");
    expect(armarVentaPos({ ...base, lineas: [{ productoId: "a", cantidad: 1.5, precioUnitario: 1000 }] })).toHaveProperty("error");
    expect(armarVentaPos({ ...base, lineas: [{ productoId: "a", cantidad: 1, precioUnitario: -1 }] })).toHaveProperty("error");
    expect(armarVentaPos({ ...base, lineas: [{ productoId: "zz", cantidad: 1, precioUnitario: 1 }] })).toHaveProperty("error");
  });

  it("sin cliente queda como invitado: sin patente ni clienteId", () => {
    const r = armarVentaPos(base);
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.clienteId).toBe("");
    expect(r.venta.patente).toBe("");
    expect(r.venta.nombre).toBe("Invitado");
  });

  it("con cliente, la compra queda a su nombre y patente (aparece en su ficha)", () => {
    const r = armarVentaPos({ ...base, cliente: { id: "c1", nombre: "Ana", patente: "ABCD12" } });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.clienteId).toBe("c1");
    expect(r.venta.patente).toBe("ABCD12");
    expect(r.venta.nombre).toBe("Ana");
  });

  it("respeta montoCobrado implícito y datos de factura", () => {
    const r = armarVentaPos({
      ...base,
      datosFactura: { tipoDocumento: "Factura", razonSocial: "ACME SpA", rut: "76.123.456-7" },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.tipoDocumento).toBe("Factura");
    expect(r.venta.razonSocial).toBe("ACME SpA");
  });
});

describe("armarVentaPos — el navegador no puede pisar lo que calcula el servidor", () => {
  it("datosFactura solo aporta los datos de facturación, nada más", () => {
    const r = armarVentaPos({
      ...base,
      // Un POST directo al Server Action puede mandar cualquier cosa acá: el
      // tipo TypeScript no existe en runtime.
      datosFactura: {
        tipoDocumento: "Factura",
        razonSocial: "ACME SpA",
        precio: -250000,
        fecha: "2020-01-01T00:00:00.000Z",
        creadoPor: "Otro Funcionario",
        tipo: "Plan nuevo",
        estadoPago: "pendiente",
      } as never,
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(2 * 1000 + 2990);
    expect(r.venta.fecha).toBe(base.fecha);
    expect(r.venta.creadoPor).toBe("Cajero");
    expect(r.venta.tipo).toBe("Venta de productos");
    expect(r.venta.estadoPago).toBe("pagado");
    expect(r.venta.razonSocial).toBe("ACME SpA");
  });
});
