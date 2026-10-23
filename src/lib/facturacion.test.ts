import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, Venta } from "@/types";

const db = vi.hoisted(() => ({ ventas: [] as Venta[], clientes: [] as Cliente[], reservadas: new Set<string>() }));
const emitirFactura = vi.hoisted(() => vi.fn(async () => 123));
const ErrorFactura = vi.hoisted(
  () =>
    class extends Error {
      constructor(message: string, readonly motivo: string) {
        super(message);
      }
    }
);

vi.mock("@/lib/dataAccess/ventas", () => ({
  ventasPorIds: async (ids: string[]) => db.ventas.filter((v) => ids.includes(v.id)),
  ventasPorFolio: async () => [],
  // Igual que el UPDATE condicional: solo toma las que nadie tomó antes.
  reservarVentasFactura: async (ids: string[]) => ids.filter((id) => !db.reservadas.has(id) && (db.reservadas.add(id), true)),
  liberarVentasFactura: async (ids: string[]) => ids.forEach((id) => db.reservadas.delete(id)),
  marcarFacturaEmitida: async () => true,
}));
vi.mock("@/lib/dataAccess/clientes", () => ({
  getClientesByIds: async (ids: string[]) => db.clientes.filter((c) => ids.includes(c.id)),
}));
vi.mock("@/lib/dataAccess/empresas", () => ({ empresaPorRut: async () => null }));
vi.mock("@/lib/simplefactura", () => ({ emitirFactura, ErrorFactura, pdfFactura: async () => Buffer.from("%PDF") }));
vi.mock("@/lib/mailing/proveedor", () => ({ enviarCorreoTransaccional: async () => ({ ok: true }) }));
vi.mock("@/lib/mailing/plantillaBase", () => ({ envolverHtmlBase: (s: string) => s }));

import { emitirFacturaDeVentas, emitirFacturasAutomaticas } from "./facturacion";

const venta = (id: string, extra: Partial<Venta> = {}): Venta =>
  ({ id, clienteId: "c1", patente: "ABCD12", nombre: "", plan: "", precio: 19990, tipo: "Promo 4 Lavados", fecha: "2026-10-08T12:00:00Z", ...extra }) as Venta;
const cliente = (id: string, extra: Partial<Cliente> = {}): Cliente =>
  ({ id, nombre: "X", patente: "ABCD12", rut: "76.535.951-1", razonSocial: "TASVIP", giro: "Transporte", direccion: "Calle 1, Temuco", tipoDocumento: "Factura", email: "a@b.cl", ...extra }) as Cliente;

const idsEmitidos = () => (emitirFactura.mock.calls as unknown as [Venta[]][]).map(([vs]) => vs.map((v) => v.id));

beforeEach(() => {
  db.ventas = [];
  db.clientes = [cliente("c1"), cliente("c2", { tipoDocumento: "Boleta" })];
  db.reservadas = new Set();
  emitirFactura.mockClear();
});

describe("emitirFacturasAutomaticas", () => {
  it("factura en una sola las ventas pagadas de un cliente con Factura en su ficha", async () => {
    db.ventas = [venta("a"), venta("b", { estadoPago: "pagado" })];
    await emitirFacturasAutomaticas(["a", "b"]);
    expect(idsEmitidos()).toEqual([["a", "b"]]);
  });

  it("no factura boletas, ventas sin monto ni ventas por pagar o con abono", async () => {
    db.ventas = [
      venta("boleta", { clienteId: "c2" }),
      venta("cero", { precio: 0 }),
      venta("pend", { estadoPago: "pendiente" }),
      venta("abono", { estadoPago: "abono50" }),
      // Compra web donde eligió Boleta aunque su ficha diga Factura.
      venta("web-boleta", { tipoDocumento: "Boleta" }),
    ];
    await emitirFacturasAutomaticas(db.ventas.map((v) => v.id));
    expect(emitirFactura).not.toHaveBeenCalled();
  });

  it("una compra web con Factura usa los datos de la venta aunque no tenga cliente", async () => {
    db.ventas = [venta("w", { clienteId: "", tipoDocumento: "Factura", rut: "77.111.222-3", razonSocial: "ACME", giro: "Retail", direccion: "Av 1, Temuco" })];
    await emitirFacturasAutomaticas(["w"]);
    expect(idsEmitidos()).toEqual([["w"]]);
  });

  it("una venta que ya no existe (transacción revertida) no se factura", async () => {
    await emitirFacturasAutomaticas(["fantasma"]);
    expect(emitirFactura).not.toHaveBeenCalled();
  });
});

describe("emitirFacturaDeVentas", () => {
  it("dos emisiones de la misma venta a la vez sacan una sola factura", async () => {
    db.ventas = [venta("a")];
    const [r1, r2] = await Promise.all([emitirFacturaDeVentas(["a"]), emitirFacturaDeVentas(["a"])]);
    expect(emitirFactura).toHaveBeenCalledTimes(1);
    expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
  });

  it("si SimpleFactura la rechaza, la venta vuelve a quedar pendiente", async () => {
    db.ventas = [venta("a")];
    emitirFactura.mockRejectedValueOnce(new ErrorFactura("sin folios", "rechazo"));
    expect((await emitirFacturaDeVentas(["a"])).ok).toBe(false);
    expect(db.reservadas.has("a")).toBe(false);
  });

  it("si no se sabe si salió (timeout), la venta sigue reservada para no duplicarla", async () => {
    db.ventas = [venta("a")];
    emitirFactura.mockRejectedValueOnce(new ErrorFactura("no respondió", "incierto"));
    const r = await emitirFacturaDeVentas(["a"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toBe("incierto");
    expect(db.reservadas.has("a")).toBe(true);
  });
});

describe("reintento de la factura automática", () => {
  it("reintenta lo transitorio y emite al segundo intento", async () => {
    vi.useFakeTimers();
    db.ventas = [venta("a")];
    emitirFactura.mockRejectedValueOnce(new ErrorFactura("sin token", "transitorio"));
    const p = emitirFacturasAutomaticas(["a"]);
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();
    expect(emitirFactura).toHaveBeenCalledTimes(2);
  });

  it("no reintenta un resultado incierto", async () => {
    db.ventas = [venta("a")];
    emitirFactura.mockRejectedValueOnce(new ErrorFactura("timeout", "incierto"));
    await emitirFacturasAutomaticas(["a"]);
    expect(emitirFactura).toHaveBeenCalledTimes(1);
  });
});
