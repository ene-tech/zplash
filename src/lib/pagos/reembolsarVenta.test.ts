import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá: el reembolso solo llama a Transbank cuando corresponde
// (venta viva, sin contra-asiento previo, monto pedido dentro de lo cobrado),
// el contra-asiento que inserta queda con precio NEGATIVO, tipo "Reembolso" y
// el motivo en las notas — de eso depende que Cierre de Caja lo descuente en
// el día correcto — y al cliente con correo se le avisa de la devolución.

let respuestas: unknown[][] = [];
const inserts: Record<string, unknown>[] = [];
const chain = {
  from: () => chain,
  innerJoin: () => chain,
  where: () => chain,
  limit: () => Promise.resolve(respuestas.shift() ?? []),
};
const fakeTx = {
  execute: () => Promise.resolve(),
  select: () => chain,
  insert: () => ({
    values: (fila: Record<string, unknown>) => {
      inserts.push(fila);
      return Promise.resolve();
    },
  }),
};
vi.mock("@/db", () => ({
  getDb: () => ({
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
    // El select de la ficha del cliente para el correo corre FUERA de la
    // transacción (ver reembolsarVentaTarjeta).
    select: () => chain,
  }),
}));
// after() fuera de un request de Next tira error: acá se ejecuta al toque.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const refundWebpay = vi.fn(() => Promise.resolve({ type: "NULLIFIED", response_code: 0, authorization_code: "r1" }));
const refundOneclick = vi.fn(() => Promise.resolve({ type: "REVERSED" }));
vi.mock("@/lib/transbank", () => ({
  webpayTransaction: () => ({ refund: (...args: unknown[]) => refundWebpay(...(args as [])) }),
  oneclickTransaction: () => ({ refund: (...args: unknown[]) => refundOneclick(...(args as [])) }),
  oneclickChildCommerceCode: () => "597055555543",
}));

const correos: { to: string; subject: string; html: string }[] = [];
vi.mock("@/lib/mailing/proveedor", () => ({
  enviarCorreoTransaccional: (envio: { to: string; subject: string; html: string }) => {
    correos.push(envio);
    return Promise.resolve({ ok: true });
  },
}));

import { reembolsarVentaTarjeta } from "./reembolsarVenta";

const venta = {
  id: "v1",
  clienteId: "c1",
  patente: "AB1234",
  nombre: "Juan",
  plan: "X5",
  precio: 21990,
  tipo: "Renovación (Web)",
  fecha: "2026-09-01T12:00:00.000Z",
};
const cliente = { id: "c1", nombre: "Juan", email: "juan@correo.cl" };

describe("reembolsarVentaTarjeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    correos.length = 0;
  });

  it("venta ya reembolsada -> error sin llamar a Transbank ni insertar nada", async () => {
    respuestas = [[venta], [{ id: "reembolso-v1" }]];
    const r = await reembolsarVentaTarjeta("v1", "cliente arrepentido", "Gerencia");
    expect(r.ok).toBe(false);
    expect(refundWebpay).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
    expect(correos).toEqual([]);
  });

  it("pago Webpay -> devuelve el monto del ítem, inserta el contra-asiento negativo y avisa por correo", async () => {
    respuestas = [[venta], [], [{ monto: 21990, token: "tok1" }], [cliente]];
    const r = await reembolsarVentaTarjeta("v1", "cobro duplicado", "Gerencia");
    expect(r.ok).toBe(true);
    expect(refundWebpay).toHaveBeenCalledWith("tok1", 21990);
    expect(inserts).toEqual([
      expect.objectContaining({
        id: "reembolso-v1",
        tipo: "Reembolso",
        precio: -21990,
        metodoPago: "tarjeta",
        creadoPor: "Automático (Reembolso)",
        notas: expect.stringContaining("cobro duplicado"),
      }),
    ]);
    expect(correos).toEqual([
      expect.objectContaining({ to: "juan@correo.cl", subject: expect.stringContaining("21.990") }),
    ]);
  });

  it("devolución parcial -> cobra a Transbank solo el monto pedido y lo anota como parcial", async () => {
    respuestas = [[venta], [], [{ monto: 21990, token: "tok1" }], [cliente]];
    const r = await reembolsarVentaTarjeta("v1", "diferencia de precio", "Gerencia", 5000);
    expect(r.ok).toBe(true);
    expect(refundWebpay).toHaveBeenCalledWith("tok1", 5000);
    expect(inserts).toEqual([
      expect.objectContaining({ precio: -5000, notas: expect.stringContaining("Reembolso parcial") }),
    ]);
    expect(correos).toEqual([expect.objectContaining({ subject: expect.stringContaining("5.000") })]);
  });

  it("monto pedido mayor a lo cobrado -> error sin llamar a Transbank", async () => {
    respuestas = [[venta], [], [{ monto: 21990, token: "tok1" }]];
    const r = await reembolsarVentaTarjeta("v1", "motivo", "Gerencia", 30000);
    expect(r.ok).toBe(false);
    expect(refundWebpay).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("Transbank rechaza -> error y no se inserta contra-asiento", async () => {
    respuestas = [[venta], [], [{ monto: 21990, token: "tok1" }]];
    refundWebpay.mockResolvedValueOnce({ type: "NULLIFIED", response_code: -1, authorization_code: "" });
    const r = await reembolsarVentaTarjeta("v1", "motivo", "Gerencia");
    expect(r.ok).toBe(false);
    expect(inserts).toEqual([]);
    expect(correos).toEqual([]);
  });

  it("sin pago Webpay -> cae al cobro Oneclick y reembolsa con su buyOrder", async () => {
    respuestas = [[venta], [], [], [{ id: "oc123", monto: 19990 }], [cliente]];
    const r = await reembolsarVentaTarjeta("v1", "motivo", "Gerencia");
    expect(r.ok).toBe(true);
    expect(refundOneclick).toHaveBeenCalledWith("oc123", "597055555543", "oc123", 19990);
    expect(inserts).toEqual([expect.objectContaining({ precio: -19990 })]);
  });
});
