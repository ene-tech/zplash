import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clienteIp, rateLimited } from "./rateLimit";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimited", () => {
  it("deja pasar hasta el límite y bloquea al siguiente intento", () => {
    const key = "k1";
    expect(rateLimited(key, 3, 1000)).toBe(false);
    expect(rateLimited(key, 3, 1000)).toBe(false);
    expect(rateLimited(key, 3, 1000)).toBe(false);
    expect(rateLimited(key, 3, 1000)).toBe(true);
  });

  it("se resetea al avanzar el tiempo más allá de la ventana", () => {
    const key = "k2";
    expect(rateLimited(key, 2, 1000)).toBe(false);
    expect(rateLimited(key, 2, 1000)).toBe(false);
    expect(rateLimited(key, 2, 1000)).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(rateLimited(key, 2, 1000)).toBe(false);
  });

  it("no mezcla el conteo entre distintas keys", () => {
    expect(rateLimited("a", 1, 1000)).toBe(false);
    expect(rateLimited("a", 1, 1000)).toBe(true);
    // "b" es una key distinta: no debería verse afectada por los golpes de "a"
    expect(rateLimited("b", 1, 1000)).toBe(false);
  });
});

// La key del límite sale de clienteIp(), así que si el cliente puede elegirla
// TODOS los límites de la app quedan desactivados: bastaba mandar un
// "X-Forwarded-For" distinto en cada pedido para que login, OTP, consulta de
// tickets y el costo por lectura de Plate Recognizer no toparan nunca.
function pedido(headers: Record<string, string>) {
  // clienteIp solo usa request.headers.get: no hace falta un NextRequest real.
  return { headers: new Headers(headers) } as unknown as Parameters<typeof clienteIp>[0];
}

describe("clienteIp", () => {
  it("usa x-real-ip, que lo pone el proxy, aunque venga un x-forwarded-for falsificado", () => {
    expect(clienteIp(pedido({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1" }))).toBe("5.5.5.5");
  });

  it("sin x-real-ip cae al ÚLTIMO x-forwarded-for, no al primero", () => {
    // El cliente controla lo que antepone; la última entrada la agrega el
    // proxy más cercano. Tomar la primera era el agujero.
    expect(clienteIp(pedido({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("sin ninguno de los dos devuelve una key fija", () => {
    expect(clienteIp(pedido({}))).toBe("desconocido");
  });

  it("dos pedidos del mismo origen con x-forwarded-for distinto comparten límite", () => {
    const a = clienteIp(pedido({ "x-real-ip": "7.7.7.7", "x-forwarded-for": "1.1.1.1" }));
    const b = clienteIp(pedido({ "x-real-ip": "7.7.7.7", "x-forwarded-for": "2.2.2.2" }));
    expect(a).toBe(b);
    expect(rateLimited(`falsificado:${a}`, 1, 60_000)).toBe(false);
    expect(rateLimited(`falsificado:${b}`, 1, 60_000)).toBe(true);
  });
});
