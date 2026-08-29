import { beforeEach, describe, expect, it, vi } from "vitest";

// Estas Server Actions son endpoints POST invocables desde afuera y su id
// viaja en el bundle público (AppContext las importa desde un componente
// "use client"). Hasta este cambio no chequeaban sesión: un POST sin cookie
// devolvía `clientes` entero —nombre, correo, teléfono, RUT, dirección de
// todos—, la cartola bancaria, la contabilidad y los contratos del personal.
// Lo que se fija acá es esa puerta.

const mockTieneSesionValida = vi.fn();
vi.mock("@/lib/session", () => ({ tieneSesionValida: () => mockTieneSesionValida() }));

const mockLoadCore = vi.fn();
const mockLoadHistorial = vi.fn();
const mockLoadAll = vi.fn();
const mockLoadPerfilesLogin = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  loadCore: () => mockLoadCore(),
  loadHistorial: () => mockLoadHistorial(),
  loadAll: () => mockLoadAll(),
  loadPerfilesLogin: () => mockLoadPerfilesLogin(),
}));

import { loadAll, loadCore, loadHistorial, loadPerfilesLogin } from "./loadAll";

describe("gate de sesión de las Server Actions de carga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCore.mockResolvedValue({ clientes: [{ id: "c1", email: "ana@ejemplo.com" }] });
    mockLoadHistorial.mockResolvedValue({ ventas: [], ingresos: [], movimientosContables: [] });
    mockLoadAll.mockResolvedValue({ clientes: [] });
    mockLoadPerfilesLogin.mockResolvedValue([{ id: "p1", nombre: "Gerencia", modulos: [] }]);
  });

  for (const [nombre, accion] of [
    ["loadCore", loadCore],
    ["loadHistorial", loadHistorial],
    ["loadAll", loadAll],
  ] as const) {
    it(`${nombre} no devuelve nada sin sesión`, async () => {
      mockTieneSesionValida.mockResolvedValue(false);
      await expect(accion()).rejects.toThrow("Sin sesión");
    });

    it(`${nombre} sí consulta la base con sesión válida`, async () => {
      mockTieneSesionValida.mockResolvedValue(true);
      await expect(accion()).resolves.toBeDefined();
    });
  }

  it("loadPerfilesLogin sigue siendo público: la pantalla de login lo necesita antes de haber iniciado sesión", async () => {
    mockTieneSesionValida.mockResolvedValue(false);
    const perfiles = await loadPerfilesLogin();
    expect(perfiles).toEqual([{ id: "p1", nombre: "Gerencia", modulos: [] }]);
    expect(mockTieneSesionValida).not.toHaveBeenCalled();
  });
});
