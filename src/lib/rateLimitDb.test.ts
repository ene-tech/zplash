import { describe, expect, it, vi } from "vitest";

// La versión compartida en Postgres: bloquea cuando la base dice que se pasó
// del límite, y si la base falla (tabla sin crear) cae a la de memoria en vez
// de tumbar el login.
const execute = vi.fn();
vi.mock("@/db", () => ({ getDb: () => ({ execute: (...a: unknown[]) => execute(...a) }) }));

import { rateLimited } from "./rateLimit";

describe("rateLimited (Postgres)", () => {
  it("bloquea solo pasado el límite que cuenta la base", async () => {
    execute.mockResolvedValueOnce([{ golpes: 3 }]);
    expect(await rateLimited("k", 3, 1000)).toBe(false);
    execute.mockResolvedValueOnce([{ golpes: 4 }]);
    expect(await rateLimited("k", 3, 1000)).toBe(true);
  });

  it("sin tabla cae al límite en memoria", async () => {
    execute.mockRejectedValue(new Error('relation "rate_limits" does not exist'));
    expect(await rateLimited("sin-tabla", 1, 1000)).toBe(false);
    expect(await rateLimited("sin-tabla", 1, 1000)).toBe(true);
  });
});
