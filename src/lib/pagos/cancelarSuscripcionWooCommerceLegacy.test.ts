import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/db", () => ({ getDb: () => ({ update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) }) }));

const sub = (id: number, patente: string, email: string) => ({
  id,
  status: "active",
  billing: { email, patente_del_vehiculo: patente },
});

// Devuelve `lotes` como páginas sucesivas de /wc/v3/subscriptions y registra
// los PUT de cancelación.
function mockWoo(lotes: object[][]) {
  const cancelados: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        cancelados.push(Number(url.split("/").pop()));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      const page = Number(new URL(url).searchParams.get("page"));
      return Promise.resolve({
        ok: true,
        headers: { get: (h: string) => (h.toLowerCase() === "x-wp-totalpages" ? String(lotes.length) : null) },
        json: () => Promise.resolve(lotes[page - 1] || []),
      });
    })
  );
  return cancelados;
}

beforeEach(() => {
  process.env.WOOCOMMERCE_SITE_URL = "https://wp.test";
  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("cancelarSuscripcionWooCommerceLegacy", () => {
  it("la patente gana sobre el email aunque la del otro auto venga antes", async () => {
    const cancelados = mockWoo([[sub(1, "VPCB60", "dos@autos.cl"), sub(2, "TDVP14", "dos@autos.cl")]]);
    const { cancelarSuscripcionWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    expect(await cancelarSuscripcionWooCommerceLegacy("TDVP14", "dos@autos.cl")).toEqual({ cancelada: true, ids: [2] });
    expect(cancelados).toEqual([2]);
  });

  it("cancela las dos suscripciones de la misma patente, aunque caigan en páginas distintas", async () => {
    const cancelados = mockWoo([[sub(1, "ABCD12", "x@x.cl")], [sub(2, "ABCD12", "x@x.cl")]]);
    const { cancelarSuscripcionWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    await cancelarSuscripcionWooCommerceLegacy("ABCD12", "x@x.cl");
    expect(cancelados).toEqual([1, 2]);
  });

  it("sin email no toca las suscripciones de los otros autos del cliente", async () => {
    const cancelados = mockWoo([[sub(1, "XYZW78", "uno@x.cl")]]);
    const { cancelarSuscripcionWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    expect(await cancelarSuscripcionWooCommerceLegacy("ABCD12", "")).toEqual({ cancelada: false, ids: [] });
    expect(cancelados).toEqual([]);
  });

  // "No sé cuál es" no puede terminar en el correo que le dice al cliente que
  // ya no se le cobra: tiene que reventar para que el caller devuelva "error".
  it("lanza si el email tiene dos suscripciones y ninguna trae la patente", async () => {
    mockWoo([[sub(1, "VPCB60", "dos@autos.cl"), sub(2, "TDVP14", "dos@autos.cl")]]);
    const { cancelarSuscripcionWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    await expect(cancelarSuscripcionWooCommerceLegacy("QQQQ99", "dos@autos.cl")).rejects.toThrow(/revisarlo a mano/);
  });
});

describe("cortarCobroWooCommerceLegacy", () => {
  const cliente = { id: "c1", email: "uno@x.cl", renovacionAutoWooDesde: "2026-08-12" };

  it("le pregunta a WooCommerce aunque el cliente no tenga la marca", async () => {
    const cancelados = mockWoo([[sub(9, "ABCD12", "uno@x.cl")]]);
    const { cortarCobroWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    expect(await cortarCobroWooCommerceLegacy({ ...cliente, renovacionAutoWooDesde: null }, "ABCD12", "test")).toBe("cancelada");
    expect(cancelados).toEqual([9]);
  });

  // El email es el respaldo para las suscripciones que quedaron con la patente
  // vieja, y solo se puede usar con evidencia de que ESTA patente estuvo en Woo.
  it("sin marca no busca por email", async () => {
    mockWoo([[sub(9, "OTRO99", "uno@x.cl")]]);
    const { cortarCobroWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    expect(await cortarCobroWooCommerceLegacy({ ...cliente, renovacionAutoWooDesde: null }, "ABCD12", "test")).toBe("sin_suscripcion");
    expect(await cortarCobroWooCommerceLegacy(cliente, "ABCD12", "test")).toBe("cancelada");
  });

  it("un WooCommerce caído devuelve error, no un falso 'nada que cancelar'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve("site lock") })));
    const { cortarCobroWooCommerceLegacy } = await import("./cancelarSuscripcionWooCommerceLegacy");

    expect(await cortarCobroWooCommerceLegacy(cliente, "ABCD12", "test")).toBe("error");
  });
});
