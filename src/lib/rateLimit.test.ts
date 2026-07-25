import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimited } from "./rateLimit";

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
