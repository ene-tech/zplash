import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovimientoContable } from "@/types";

const mockTieneModulo = vi.fn();
const mockTieneSesionValida = vi.fn();
vi.mock("@/lib/session", () => ({
  tieneModulo: (m: string) => mockTieneModulo(m),
  tieneSesionValida: () => mockTieneSesionValida(),
}));

const mockUpsertMovimientosContables = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  upsertMovimientosContables: (rows: unknown[]) => mockUpsertMovimientosContables(rows),
}));

const movimiento = (overrides: Partial<MovimientoContable> = {}): MovimientoContable => ({
  id: "m1",
  tipo: "ingreso",
  fecha: new Date().toISOString(),
  descripcion: "Lavado único – OCTAVIO (VLXV14)",
  monto: 9990,
  estado: "pagado",
  creadoEn: new Date().toISOString(),
  ventaId: "v1",
  ...overrides,
});

beforeEach(() => {
  mockTieneModulo.mockReset();
  mockTieneSesionValida.mockReset();
  mockUpsertMovimientosContables.mockReset();
  mockUpsertMovimientosContables.mockResolvedValue(true);
});

describe("upsertMovimientosContables", () => {
  it("permite el movimiento derivado de una venta (ventaId) con cualquier sesión válida, sin módulo contabilidad", async () => {
    mockTieneModulo.mockResolvedValue(false); // perfil operador: sin "contabilidad"
    mockTieneSesionValida.mockResolvedValue(true);

    const { upsertMovimientosContables } = await import("./contabilidad");
    const ok = await upsertMovimientosContables([movimiento()]);

    expect(ok).toBe(true);
    expect(mockUpsertMovimientosContables).toHaveBeenCalled();
  });

  it("sigue exigiendo el módulo contabilidad para un movimiento manual (sin ventaId)", async () => {
    mockTieneModulo.mockResolvedValue(false);
    mockTieneSesionValida.mockResolvedValue(true);

    const { upsertMovimientosContables } = await import("./contabilidad");
    const ok = await upsertMovimientosContables([movimiento({ ventaId: undefined })]);

    expect(ok).toBe(false);
    expect(mockUpsertMovimientosContables).not.toHaveBeenCalled();
  });

  it("bloquea el movimiento derivado si no hay sesión válida", async () => {
    mockTieneModulo.mockResolvedValue(false);
    mockTieneSesionValida.mockResolvedValue(false);

    const { upsertMovimientosContables } = await import("./contabilidad");
    const ok = await upsertMovimientosContables([movimiento()]);

    expect(ok).toBe(false);
  });
});
