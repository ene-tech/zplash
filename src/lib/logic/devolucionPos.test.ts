import { describe, expect, it } from "vitest";
import { armarDevolucionPos, type DatosDevolucionPos } from "./devolucionPos";
import type { VentaItem } from "@/types";

const item = (productoId: string, cantidad: number, precioUnitario: number): VentaItem => ({
  id: `v1-${productoId}`,
  ventaId: "v1",
  productoId,
  sku: productoId.toUpperCase(),
  detalle: `Producto ${productoId}`,
  cantidad,
  precioUnitario,
});

const base: DatosDevolucionPos = {
  venta: { id: "v1", clienteId: "", patente: "", nombre: "Invitado" },
  itemsVenta: [item("a", 3, 9990), item("b", 1, 2990)],
  devueltoPrevio: new Map(),
  lineas: [{ productoId: "a", cantidad: 1, nuevo: true }],
  devolucionesPrevias: 0,
  fecha: "2026-09-27T15:00:00.000Z",
  creadoPor: "Cajero",
  motivo: "El cliente se arrepintió",
  forma: "efectivo",
};

describe("armarDevolucionPos", () => {
  it("deshace lo devuelto: venta y líneas en negativo, con la fecha de hoy", () => {
    const r = armarDevolucionPos(base);
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.precio).toBe(-9990);
    expect(r.venta.tipo).toBe("Reembolso");
    expect(r.venta.fecha).toBe(base.fecha);
    expect(r.venta.cantidadItems).toBe(1);
    expect(r.items[0].cantidad).toBe(-1);
    expect(r.items[0].precioUnitario).toBe(9990);
    // El asiento descuenta del canal de la tienda, no infla los costos.
    expect(r.movimiento.tipo).toBe("ingreso");
    expect(r.movimiento.monto).toBe(-9990);
    expect(r.movimiento.categoria).toBe("Venta de Productos");
    expect(r.movimiento.ventaId).toBe(r.venta.id);
  });

  it("el vale a favor no saca plata de la caja", () => {
    const r = armarDevolucionPos({ ...base, forma: "vale" });
    if ("error" in r) throw new Error(r.error);
    // Sin método de pago: el arqueo del día no espera menos efectivo.
    expect(r.venta.metodoPago).toBeUndefined();
    expect(r.venta.notas).toContain("vale a favor");
    // En efectivo sí descuenta de la caja.
    const enEfectivo = armarDevolucionPos(base);
    if ("error" in enEfectivo) throw new Error(enEfectivo.error);
    expect(enEfectivo.venta.metodoPago).toBe("efectivo");
  });

  it("no deja devolver más de lo vendido, ni de lo que queda tras otra devolución", () => {
    expect(armarDevolucionPos({ ...base, lineas: [{ productoId: "a", cantidad: 4, nuevo: true }] })).toHaveProperty(
      "error"
    );
    const conPrevia = armarDevolucionPos({
      ...base,
      devueltoPrevio: new Map([["a", 2]]),
      lineas: [{ productoId: "a", cantidad: 2, nuevo: true }],
    });
    expect(conPrevia).toMatchObject({ error: expect.stringContaining("solo quedan 1") });
    const yaCompleta = armarDevolucionPos({
      ...base,
      devueltoPrevio: new Map([["a", 3]]),
      lineas: [{ productoId: "a", cantidad: 1, nuevo: true }],
    });
    expect(yaCompleta).toMatchObject({ error: expect.stringContaining("ya se devolvió completo") });
  });

  it("rechaza un producto que no estaba en la venta, el carrito vacío y el motivo en blanco", () => {
    expect(armarDevolucionPos({ ...base, lineas: [{ productoId: "zz", cantidad: 1, nuevo: true }] })).toHaveProperty(
      "error"
    );
    expect(armarDevolucionPos({ ...base, lineas: [] })).toHaveProperty("error");
    expect(armarDevolucionPos({ ...base, motivo: "   " })).toHaveProperty("error");
  });

  it("varias devoluciones de la misma venta no chocan de id", () => {
    const primera = armarDevolucionPos(base);
    const segunda = armarDevolucionPos({ ...base, devolucionesPrevias: 1, devueltoPrevio: new Map([["a", 1]]) });
    if ("error" in primera || "error" in segunda) throw new Error("no debería fallar");
    expect(primera.venta.id).toBe("reembolso-v1-1");
    expect(segunda.venta.id).toBe("reembolso-v1-2");
    expect(primera.items[0].id).not.toBe(segunda.items[0].id);
  });

  it("conserva los datos de factura de la venta original", () => {
    const r = armarDevolucionPos({
      ...base,
      venta: { ...base.venta, tipoDocumento: "Factura", razonSocial: "ACME SpA", rut: "76.123.456-7" },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.venta.tipoDocumento).toBe("Factura");
    expect(r.venta.rut).toBe("76.123.456-7");
  });
});
