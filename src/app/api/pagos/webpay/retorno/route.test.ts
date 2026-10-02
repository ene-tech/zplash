import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Lo que se fija acá: recargar la página de retorno de un pago ya procesado
// responde con lo guardado y no vuelve a llamar a commit() (que falla con un
// token ya confirmado y mostraba "error" sobre un pago aprobado).

let previo: { buyOrder: string; estado: string; tipo: string }[] = [];
vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => {
          // 1º la fila del pago (termina en .limit), 2º los ítems (se await-ea directo).
          const items = Promise.resolve([]);
          return Object.assign(items, { limit: () => Promise.resolve(previo) });
        },
      }),
    }),
  }),
}));
const commit = vi.fn();
vi.mock("@/lib/transbank", () => ({ webpayTransaction: () => ({ commit: (t: string) => commit(t) }) }));
const aplicarRetornoWebpay = vi.fn(() => Promise.resolve({ tipo: "ok" }));
vi.mock("@/lib/pagos", () => ({ aplicarRetornoWebpay: () => aplicarRetornoWebpay(), TIPOS_PROMO_CUENTA: new Set<string>() }));

import { GET } from "./route";

const retorno = (token: string) =>
  ({ nextUrl: new URL(`https://zplash.cl/api/pagos/webpay/retorno?token_ws=${token}`) }) as unknown as NextRequest;

describe("GET /api/pagos/webpay/retorno", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pago ya aprobado (recarga): redirige a ok sin volver a confirmar con Transbank", async () => {
    previo = [{ buyOrder: "wp1", estado: "aprobada", tipo: "renovacion" }];
    const res = await GET(retorno("tok1"));
    expect(commit).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("estado=ok");
  });

  it("pago en curso: confirma con Transbank y lo aplica", async () => {
    previo = [{ buyOrder: "wp1", estado: "iniciada", tipo: "renovacion" }];
    commit.mockResolvedValue({ buy_order: "wp1", response_code: 0, amount: 19990 });
    const res = await GET(retorno("tok1"));
    expect(commit).toHaveBeenCalledWith("tok1");
    expect(aplicarRetornoWebpay).toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("estado=ok");
  });
});
