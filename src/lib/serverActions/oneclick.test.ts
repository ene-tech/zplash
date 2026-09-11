import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente } from "@/types";

const mockTieneModulo = vi.fn();
vi.mock("@/lib/session", () => ({ tieneModulo: (m: string) => mockTieneModulo(m) }));

const mockObtenerSuscripcion = vi.fn();
const mockSuspender = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  obtenerSuscripcionOneclick: (p: string) => mockObtenerSuscripcion(p),
  suspenderSuscripcionOneclick: (id: string) => mockSuspender(id),
}));

const mockBuscarCliente = vi.fn();
const mockCorreo = vi.fn();
vi.mock("@/lib/mailing/reglas", () => ({
  buscarCliente: (id: string) => mockBuscarCliente(id),
  evaluarReglasCorreoPorSuscripcionCancelada: (c: Cliente) => mockCorreo(c),
}));

const mockCortarWoo = vi.fn();
vi.mock("@/lib/pagos", () => ({
  cortarCobroWooCommerceLegacy: (c: Cliente, p: string, m: string) => mockCortarWoo(c, p, m),
  cobrarSuscripcion: vi.fn(),
}));

const cliente = (overrides: Partial<Cliente> = {}): Cliente =>
  ({ id: "c1", patente: "VLXV14", nombre: "OCTAVIO", email: "o@x.cl", ...overrides }) as Cliente;

beforeEach(() => {
  vi.resetAllMocks();
  mockTieneModulo.mockResolvedValue(true);
  mockObtenerSuscripcion.mockResolvedValue(null);
  mockSuspender.mockResolvedValue(true);
  mockCorreo.mockResolvedValue(undefined);
  mockCortarWoo.mockResolvedValue("cancelada");
});

describe("anularSuscripcion", () => {
  it("corta el cobro sin dar de baja la tarjeta en Transbank", async () => {
    mockBuscarCliente.mockResolvedValue(cliente());
    mockObtenerSuscripcion.mockResolvedValue({ id: "s1", estado: "activa" });
    mockCortarWoo.mockResolvedValue("sin_suscripcion");

    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: true, woo: "sin_suscripcion" });
    // suspender, no cancelar: la inscripción sigue viva y el cron solo cobra "activa".
    expect(mockSuspender).toHaveBeenCalledWith("s1");
    expect(mockCorreo).toHaveBeenCalledOnce();
  });

  it("cancela también la suscripción de WooCommerce que el cliente arrastra", async () => {
    mockBuscarCliente.mockResolvedValue(cliente({ renovacionAutoWooDesde: "2025-01-01" }));

    // Sin fila Oneclick: el cobro automático vive solo en WooCommerce.
    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: false, woo: "cancelada" });
    expect(mockCortarWoo).toHaveBeenCalledWith(expect.objectContaining({ patente: "VLXV14" }), "VLXV14", expect.any(String));
    expect(mockSuspender).not.toHaveBeenCalled();
  });

  // Le pregunta a WooCommerce aunque el cliente no tenga la marca puesta: las
  // suscripciones reactivadas a mano en Woo quedan cobrando con
  // renovacionAutoWooDesde en null (ver cortarCobroWooCommerceLegacy).
  it("consulta WooCommerce aunque el cliente no tenga la marca", async () => {
    mockBuscarCliente.mockResolvedValue(cliente());
    const { anularSuscripcion } = await import("./oneclick");
    await anularSuscripcion("c1");
    expect(mockCortarWoo).toHaveBeenCalledOnce();
  });

  it("si WooCommerce rechaza el corte NO manda el respaldo: le seguirían cobrando", async () => {
    mockBuscarCliente.mockResolvedValue(cliente({ renovacionAutoWooDesde: "2025-01-01" }));
    mockObtenerSuscripcion.mockResolvedValue({ id: "s1", estado: "suspendida" });
    mockCortarWoo.mockResolvedValue("error");

    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: true, woo: "error" });
    expect(mockCorreo).not.toHaveBeenCalled();
  });
});
