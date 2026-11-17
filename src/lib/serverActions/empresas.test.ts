import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Empresa } from "@/types";

// El mesón (módulo "operador") registra la empresa nueva que el cliente pide
// en la factura al cobrar, pero solo altas: no puede modificar una existente.

const modulos = new Set<string>();
vi.mock("@/lib/session", () => ({
  tieneModulo: async (m: string) => modulos.has(m),
  tieneAlgunModulo: async (ms: string[]) => ms.some((m) => modulos.has(m)),
}));

const mockSonNuevas = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  sonEmpresasNuevas: (r: Empresa[]) => mockSonNuevas(r),
  upsertEmpresas: (r: Empresa[]) => mockUpsert(r),
  deleteEmpresas: async () => true,
}));

const { upsertEmpresas, deleteEmpresas } = await import("./empresas");

const empresa: Empresa = { id: "e1", rut: "76.086.428-5", razonSocial: "Transportes Sur SpA", creadoEn: "2026-11-16T12:00:00Z" };

beforeEach(() => {
  modulos.clear();
  mockSonNuevas.mockReset();
  mockUpsert.mockReset();
  mockUpsert.mockResolvedValue(true);
});

describe("upsertEmpresas desde el mesón", () => {
  it("el operador registra una empresa nueva", async () => {
    modulos.add("operador");
    mockSonNuevas.mockResolvedValue(true);
    expect(await upsertEmpresas([empresa])).toBe(true);
  });

  it("el operador no modifica una empresa ya registrada", async () => {
    modulos.add("operador");
    mockSonNuevas.mockResolvedValue(false);
    expect(await upsertEmpresas([empresa])).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("el operador no borra empresas", async () => {
    modulos.add("operador");
    expect(await deleteEmpresas(["e1"])).toBe(false);
  });

  it("sin operador, pos ni facturación no puede", async () => {
    mockSonNuevas.mockResolvedValue(true);
    expect(await upsertEmpresas([empresa])).toBe(false);
  });
});
