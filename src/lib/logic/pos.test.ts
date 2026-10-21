import { describe, expect, it } from "vitest";
import { armarVentaPos, rebajaDescuento, resolverDescuentoPos, type DatosVentaPos } from "./pos";
import type { Cupon } from "@/types";

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

describe("armarVentaPos — código de descuento", () => {
  it("monto fijo: rebaja el total y deja la marca del cupón", () => {
    const r = armarVentaPos({ ...base, descuento: { codigo: "VALE01", valor: 1000, esPorcentaje: false } });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(4990 - 1000);
    expect(r.venta.viaCupon).toBe(true);
    expect(r.venta.cuponCodigo).toBe("VALE01");
    expect(r.venta.notas).toContain("VALE01");
    // Las líneas quedan a precio de lista.
    expect(r.items[0].precioUnitario).toBe(1000);
  });

  it("porcentaje sobre el subtotal", () => {
    const r = armarVentaPos({ ...base, descuento: { codigo: "P10", valor: 10, esPorcentaje: true } });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(4990 - 499);
  });

  it("nunca deja el total negativo; con $0 no lleva medio de pago", () => {
    const r = armarVentaPos({
      ...base,
      metodoPago: undefined,
      voucher: "123",
      descuento: { codigo: "VALE99", valor: 99999, esPorcentaje: false },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(0);
    expect(r.venta.metodoPago).toBeUndefined();
    expect(r.venta.voucher).toBeUndefined();
  });

  it("con algo que cobrar exige un medio de pago válido", () => {
    expect(armarVentaPos({ ...base, metodoPago: undefined })).toEqual({ error: "Elige la forma de pago" });
    expect(armarVentaPos({ ...base, metodoPago: "bitcoin" as never })).toEqual({ error: "Elige la forma de pago" });
  });
});

describe("resolverDescuentoPos", () => {
  const cupon = (extra: Partial<Cupon>): Cupon => ({
    id: "c1",
    codigo: "ABC123",
    nombreLote: "Devolución",
    valor: 2000,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad: "2999-01-01T00:00:00.000Z",
    usado: false,
    creadoEn: "2026-10-01T00:00:00.000Z",
    tipo: "descuento",
    esPorcentaje: false,
    canal: "local",
    ...extra,
  });

  it("acepta un vale abierto para un invitado (sin patente)", () => {
    expect(resolverDescuentoPos("abc123", "", [cupon({})], [])).toMatchObject({ ok: true });
  });

  it("rechaza usado, caducado, solo web y atado a otra patente", () => {
    expect(resolverDescuentoPos("ABC123", "", [cupon({ usado: true })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "", [cupon({ fechaCaducidad: "2020-01-01T00:00:00.000Z" })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "", [cupon({ canal: "web" })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "", [cupon({ patenteAsignada: "ABCD12" })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "ZZZZ99", [cupon({ patenteAsignada: "ABCD12" })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "ABCD12", [cupon({ patenteAsignada: "ABCD12" })], []).ok).toBe(true);
  });

  it("un tique de lavado (vale) no es un descuento", () => {
    expect(resolverDescuentoPos("ABC123", "", [cupon({ tipo: "vale" })], []).ok).toBe(false);
  });

  it("sin patente no acepta códigos cuya regla es la patente", () => {
    expect(resolverDescuentoPos("ABC123", "", [cupon({ unUsoPorPatente: true })], []).ok).toBe(false);
    expect(resolverDescuentoPos("ABC123", "", [cupon({ nombreLote: "Referido - ABCD12" })], []).ok).toBe(false);
  });

  it("los de solo clientes nuevos se rechazan siempre, con o sin cliente, avisando que van en el mesón", () => {
    const msg = "Este código es solo para clientes nuevos del lavado y se usa en el mesón, no en la tienda";
    expect(resolverDescuentoPos("ABC123", "", [cupon({ soloClientesNuevos: true })], [])).toEqual({ ok: false, msg });
    expect(resolverDescuentoPos("ABC123", "ABCD12", [cupon({ soloClientesNuevos: true })], [])).toEqual({
      ok: false,
      msg,
    });
  });

  it("respeta la regla de referidos: el dueño no usa su propio código", () => {
    const r = resolverDescuentoPos("ABC123", "ABCD12", [cupon({ nombreLote: "Referido - ABCD12" })], []);
    expect(r.ok).toBe(false);
  });
});

describe("rebajaDescuento", () => {
  it("monto fijo o porcentaje, nunca más que el subtotal ni negativa", () => {
    expect(rebajaDescuento(null, 5000)).toBe(0);
    expect(rebajaDescuento({ valor: 1000, esPorcentaje: false }, 5000)).toBe(1000);
    expect(rebajaDescuento({ valor: 10, esPorcentaje: true }, 4990)).toBe(499);
    expect(rebajaDescuento({ valor: 99999, esPorcentaje: false }, 5000)).toBe(5000);
    expect(rebajaDescuento({ valor: -500, esPorcentaje: false }, 5000)).toBe(0);
  });
});
