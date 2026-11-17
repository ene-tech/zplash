import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente } from "@/types";

// Candado de upsertClientes para el operador SIN módulo "clientes": los datos
// de factura que se tipean en el PagoModal (upgrade, lavado, packs) se graban
// en la ficha en el mismo commit que la venta. Si este candado los rechaza,
// el mesón muestra "Sin conexión" y la venta no se guarda.

const mockTieneModulo = vi.fn();
vi.mock("@/lib/session", () => ({
  tieneModulo: (m: string) => mockTieneModulo(m),
  sesionActual: async () => ({ nombre: "Jeny", modulos: ["operador"] }),
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/whatsapp/reglas", () => ({ evaluarReglasPorCambioPatente: async () => {} }));

const mockGetClientesByIds = vi.fn();
const mockUpsertClientes = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  getClientesByIds: (ids: string[]) => mockGetClientesByIds(ids),
  upsertClientes: (n: unknown, a: unknown) => mockUpsertClientes(n, a),
}));

const { upsertClientes } = await import("./clientes");

const ficha = (o: Partial<Cliente> = {}): Cliente =>
  ({ id: "c1", nombre: "Juan Pérez", patente: "ABCD12", tipoDocumento: "Boleta", ...o }) as Cliente;

const datosFactura = {
  tipoDocumento: "Factura" as const,
  rut: "76.086.428-5",
  razonSocial: "Transportes Sur SpA",
  giro: "Transporte",
  direccion: "Av. Siempre Viva 123, Santiago",
  email: "pagos@transportessur.cl",
};

beforeEach(() => {
  mockTieneModulo.mockReset();
  mockTieneModulo.mockImplementation(async (m: string) => m === "operador");
  mockUpsertClientes.mockReset();
  mockUpsertClientes.mockResolvedValue(true);
  mockGetClientesByIds.mockReset();
});

describe("upsertClientes: datos de factura desde el mesón", () => {
  it("el operador completa la factura de una ficha sin RUT", async () => {
    mockGetClientesByIds.mockResolvedValue([ficha()]);
    expect(await upsertClientes([{ id: "c1", ...datosFactura }])).toBe(true);
    expect(mockUpsertClientes).toHaveBeenCalled();
  });

  it("no le cambia la empresa a una ficha que ya tiene RUT", async () => {
    mockGetClientesByIds.mockResolvedValue([ficha({ tipoDocumento: "Factura", rut: "77.777.777-7", razonSocial: "Otra" })]);
    expect(await upsertClientes([{ id: "c1", ...datosFactura }])).toBe(false);
    expect(mockUpsertClientes).not.toHaveBeenCalled();
  });

  it("una ficha con Boleta y un RUT viejo puede pasar a factura con otra empresa", async () => {
    mockGetClientesByIds.mockResolvedValue([ficha({ tipoDocumento: "Boleta", rut: "77.777.777-7", razonSocial: "Vieja" })]);
    expect(await upsertClientes([{ id: "c1", ...datosFactura }])).toBe(true);
  });

  it("una ficha con Boleta y ese mismo RUT pasa a factura (el patch no repite el RUT)", async () => {
    mockGetClientesByIds.mockResolvedValue([ficha({ tipoDocumento: "Boleta", rut: "76.086.428-5", razonSocial: "Transportes Sur SpA" })]);
    expect(await upsertClientes([{ id: "c1", tipoDocumento: "Factura" }])).toBe(true);
  });

  it("rechaza un RUT mal formado", async () => {
    mockGetClientesByIds.mockResolvedValue([ficha()]);
    expect(await upsertClientes([{ id: "c1", ...datosFactura, rut: "sin rut" }])).toBe(false);
  });

  it("sin módulo operador tampoco puede", async () => {
    mockTieneModulo.mockResolvedValue(false);
    mockGetClientesByIds.mockResolvedValue([ficha()]);
    expect(await upsertClientes([{ id: "c1", ...datosFactura }])).toBe(false);
  });
});
