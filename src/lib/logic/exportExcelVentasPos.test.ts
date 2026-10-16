import { describe, expect, it } from "vitest";
import { TIPO_VENTA_PRODUCTOS, TIPO_VENTA_REEMBOLSO } from "@/lib/helpers";
import type { Venta, VentaItem } from "@/types";
import { filasVentasPos, ventasPosDelPeriodo } from "./exportExcel";

const venta = (id: string, tipo: string, fecha: string, extra: Partial<Venta> = {}): Venta => ({
  id,
  clienteId: "",
  patente: "",
  nombre: "Invitado",
  plan: "",
  precio: 0,
  tipo,
  fecha,
  creadoPor: "Ana",
  metodoPago: "efectivo",
  ...extra,
});

const item = (ventaId: string, i: number, sku: string, cantidad: number, precioUnitario: number): VentaItem => ({
  id: `${ventaId}-${i}`,
  ventaId,
  productoId: `p-${sku}`,
  sku,
  detalle: `Producto ${sku}`,
  cantidad,
  precioUnitario,
});

describe("ventasPosDelPeriodo", () => {
  it("toma ventas de productos y reembolsos del período, nada más", () => {
    const ventas = [
      venta("v1", TIPO_VENTA_PRODUCTOS, "2026-10-15T15:00:00Z"),
      venta("v2", TIPO_VENTA_REEMBOLSO, "2026-10-15T16:00:00Z"),
      venta("v3", "Lavado único", "2026-10-15T16:00:00Z"),
      venta("v4", TIPO_VENTA_PRODUCTOS, "2026-10-10T15:00:00Z"),
    ];
    expect(ventasPosDelPeriodo(ventas, "2026-10-15", "2026-10-15").map((v) => v.id)).toEqual(["v1", "v2"]);
  });
});

describe("filasVentasPos", () => {
  it("resume por producto neto de devoluciones y detalla cada línea", () => {
    const ventas = [
      venta("v2", TIPO_VENTA_PRODUCTOS, "2026-10-15T17:00:00Z", { creadoPor: "Luis", metodoPago: "tarjeta" }),
      venta("v1", TIPO_VENTA_PRODUCTOS, "2026-10-15T15:00:00Z"),
      venta("reembolso-v1-1", TIPO_VENTA_REEMBOLSO, "2026-10-15T18:00:00Z"),
    ];
    const items = [
      item("v1", 0, "A", 2, 1000),
      item("v1", 1, "B", 1, 5000),
      item("v2", 0, "A", 1, 1000),
      item("reembolso-v1-1", 0, "A", -1, 1000),
      item("otra-venta", 0, "C", 9, 9),
    ];
    const filas = filasVentasPos(ventas, items);

    expect(filas.slice(0, 5)).toEqual([
      ["Productos vendidos"],
      ["SKU", "Producto", "Cantidad", "Monto"],
      ["B", "Producto B", 1, 5000],
      ["A", "Producto A", 2, 2000],
      ["", "Total", 3, 7000],
    ]);
    expect(filas[6]).toEqual(["Detalle de ventas POS (2 tickets)"]);
    const detalle = filas.slice(8);
    expect(detalle.map((f) => [f[1], f[2], f[3], f[6], f[10]])).toEqual([
      ["v1", "Venta", "Ana", "A", 2000],
      ["v1", "Venta", "Ana", "B", 5000],
      ["v2", "Venta", "Luis", "A", 1000],
      ["reembolso-v1-1", "Devolución", "Ana", "A", -1000],
    ]);
  });
});
