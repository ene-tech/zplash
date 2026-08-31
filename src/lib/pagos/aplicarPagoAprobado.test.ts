import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "@/types";

// Lo que se fija acá: una venta que NO sobrevivió a la transacción del llamador
// no debe generar ningún aviso. cobrarSuscripcion abre un savepoint anidado y
// atrapa su error para seguir, así que el rollback es silencioso — sin este
// guard el cliente recibía un WhatsApp confirmando una renovación que no
// ocurrió, con el vencimiento viejo, después de que Transbank ya le cobró.

vi.mock("server-only", () => ({}));

let ventaEnLaBase: { id: string }[] = [];
vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(ventaEnLaBase) }) }) }),
  }),
}));

const avisos = { whatsapp: 0, correo: 0, cambioPatente: 0 };
vi.mock("@/lib/whatsapp/reglas", () => ({
  evaluarReglasPorVenta: () => { avisos.whatsapp++; return Promise.resolve(); },
  evaluarReglasPorCambioPatente: () => { avisos.cambioPatente++; return Promise.resolve(); },
}));
vi.mock("@/lib/mailing/reglas", () => ({
  evaluarReglasCorreoPorVenta: () => { avisos.correo++; return Promise.resolve(); },
}));

import { evaluarReglasSiLaVentaPersistio } from "./aplicarPagoAprobado";

const venta = { id: "v1", patente: "AB1234", nombre: "JUAN", plan: "Plan X5", precio: 21990 } as Venta;

describe("evaluarReglasSiLaVentaPersistio", () => {
  beforeEach(() => {
    avisos.whatsapp = 0;
    avisos.correo = 0;
    avisos.cambioPatente = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("no avisa nada si la venta se revirtió", async () => {
    ventaEnLaBase = [];
    expect(await evaluarReglasSiLaVentaPersistio(venta)).toBe(false);
    expect(avisos).toEqual({ whatsapp: 0, correo: 0, cambioPatente: 0 });
  });

  it("avisa por WhatsApp y correo si la venta quedó guardada", async () => {
    ventaEnLaBase = [{ id: "v1" }];
    expect(await evaluarReglasSiLaVentaPersistio(venta)).toBe(true);
    expect(avisos).toEqual({ whatsapp: 1, correo: 1, cambioPatente: 0 });
  });

  it("incluye el cambio de patente solo cuando lo hubo", async () => {
    ventaEnLaBase = [{ id: "v1" }];
    await evaluarReglasSiLaVentaPersistio(venta, { cliente: { patente: "AB1234" } as never, patenteAnterior: "ZZ9999" });
    expect(avisos.cambioPatente).toBe(1);
  });
});
