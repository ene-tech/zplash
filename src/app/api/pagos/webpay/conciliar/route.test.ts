import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Lo que se fija acá: un pago que el cliente hizo pero nadie confirmó se
// confirma (commit) antes de aplicarlo —sin commit Transbank lo reversa y el
// plan quedaba gratis—; uno ya confirmado se aplica según status(); uno sin
// pago se anula; y si Transbank no contesta no se toca nada.

let pendientes: { buyOrder: string; token: string }[] = [];
const sets: Record<string, unknown>[] = [];
vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(pendientes) }) }),
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: () => (sets.push(v), Promise.resolve()) }) }),
  }),
}));
vi.mock("@/lib/cron", () => ({ rechazoSiNoEsCron: () => null }));
const status = vi.fn();
const commit = vi.fn();
vi.mock("@/lib/transbank", () => ({ webpayTransaction: () => ({ status: (t: string) => status(t), commit: (t: string) => commit(t) }) }));
const aplicarRetornoWebpay = vi.fn<(buyOrder: string, commit: unknown) => Promise<{ tipo: string }>>(() => Promise.resolve({ tipo: "ok" }));
vi.mock("@/lib/pagos", () => ({ aplicarRetornoWebpay: (b: string, c: unknown) => aplicarRetornoWebpay(b, c) }));

import { GET } from "./route";

const req = {} as NextRequest;

describe("GET /api/pagos/webpay/conciliar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sets.length = 0;
    pendientes = [{ buyOrder: "wp1", token: "tok1" }];
    commit.mockRejectedValue(new Error("ya confirmada o vencida"));
  });

  it("pagado pero sin confirmar (cerró el navegador): lo confirma y lo aplica", async () => {
    const c = { response_code: 0, amount: 19990, authorization_code: "a1", buy_order: "wp1" };
    commit.mockResolvedValue(c);
    await GET(req);
    expect(commit).toHaveBeenCalledWith("tok1");
    expect(aplicarRetornoWebpay).toHaveBeenCalledWith("wp1", c);
    expect(status).not.toHaveBeenCalled();
  });

  it("ya confirmado por el retorno (commit falla) y AUTHORIZED: lo aplica con lo que informa status", async () => {
    const st = { status: "AUTHORIZED", response_code: 0, amount: 19990, authorization_code: "a1" };
    status.mockResolvedValue(st);
    await GET(req);
    expect(aplicarRetornoWebpay).toHaveBeenCalledWith("wp1", st);
    expect(sets).toEqual([]);
  });

  it("INITIALIZED (el cliente abandonó): queda anulada", async () => {
    status.mockResolvedValue({ status: "INITIALIZED" });
    await GET(req);
    expect(aplicarRetornoWebpay).not.toHaveBeenCalled();
    expect(sets).toEqual([expect.objectContaining({ estado: "anulada" })]);
  });

  it("Transbank no contesta: no toca nada", async () => {
    status.mockRejectedValue(new Error("caído"));
    await GET(req);
    expect(aplicarRetornoWebpay).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
  });
});
