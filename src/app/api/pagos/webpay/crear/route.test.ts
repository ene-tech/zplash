import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { precioLavadoUnicoWeb, precioZonaAspirado } from "@/lib/helpers";

// Lo que se fija acá: el monto que va a Transbank lo calcula el servidor con
// los precios de la base — un `monto` que venga en el body se ignora — y el
// carrito suma ítem por ítem lo mismo que queda registrado para /retorno.

const PRECIOS = [
  { plan: "Lavado único", normal: 9990, promo: 0 },
  { plan: "Uso Zona Aspirado Autoservicio", normal: 4990, promo: 0 },
];
const insertados: unknown[] = [];
vi.mock("@/db", () => ({
  getDb: () => ({
    // El select de precios se await-ea directo sobre from().
    select: () => ({ from: () => Promise.resolve(PRECIOS) }),
    insert: () => ({ values: (v: unknown) => (insertados.push(v), Promise.resolve()) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));
vi.mock("@/lib/rateLimit", () => ({ rateLimited: () => Promise.resolve(false), clienteIp: () => "1.1.1.1" }));
vi.mock("@/lib/auth/clienteSession", () => ({ leerSesionCliente: () => Promise.resolve(null) }));
vi.mock("@/lib/dataAccess/clientes", () => ({ buscarClientePorPatente: () => Promise.resolve(null) }));
vi.mock("@/lib/dataAccess/config", () => ({ getConfig: () => Promise.resolve({ diasGraciaPagoAtrasado: 0 }) }));
vi.mock("@/lib/pagos", () => ({ buscarCuponDescuentoPlan: () => Promise.resolve(null) }));
const create = vi.fn<(buyOrder: string, sessionId: string, monto: number, url: string) => Promise<{ url: string; token: string }>>(() =>
  Promise.resolve({ url: "https://webpay", token: "tok" })
);
vi.mock("@/lib/transbank", () => ({
  webpayTransaction: () => ({ create: (b: string, s: string, m: number, u: string) => create(b, s, m, u) }),
}));

import { POST } from "./route";

const preciosMap = Object.fromEntries(PRECIOS.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
const pedir = (body: unknown) =>
  POST({ json: () => Promise.resolve(body), nextUrl: new URL("https://zplash.cl/api/pagos/webpay/crear") } as unknown as NextRequest);

describe("POST /api/pagos/webpay/crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertados.length = 0;
  });

  it("ignora el monto que manda el cliente y cobra el precio de la base", async () => {
    const res = await pedir({ patente: "AB1234", items: [{ tipo: "lavado_unico", monto: 1 }] });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][2]).toBe(precioLavadoUnicoWeb(preciosMap));
  });

  it("el carrito cobra la suma de sus ítems", async () => {
    await pedir({ patente: "AB1234", items: [{ tipo: "lavado_unico" }, { tipo: "aspirado" }] });
    expect(create.mock.calls[0][2]).toBe(precioLavadoUnicoWeb(preciosMap) + precioZonaAspirado(preciosMap));
  });

  it("rechaza dos planes en la misma transacción", async () => {
    const res = await pedir({ patente: "AB1234", items: [{ tipo: "renovacion" }, { tipo: "renovacion" }] });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
