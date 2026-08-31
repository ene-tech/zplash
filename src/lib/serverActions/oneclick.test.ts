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

const mockCancelarWoo = vi.fn();
vi.mock("@/lib/pagos", () => ({
  cancelarSuscripcionWooCommerceLegacy: (p: string, e: string) => mockCancelarWoo(p, e),
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
  mockCancelarWoo.mockResolvedValue({ cancelada: true, subscriptionId: 7 });
});

describe("anularSuscripcion", () => {
  it("corta el cobro sin dar de baja la tarjeta en Transbank", async () => {
    mockBuscarCliente.mockResolvedValue(cliente());
    mockObtenerSuscripcion.mockResolvedValue({ id: "s1", estado: "activa" });

    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: true, woo: false });
    // suspender, no cancelar: la inscripción sigue viva y el cron solo cobra "activa".
    expect(mockSuspender).toHaveBeenCalledWith("s1");
    expect(mockCorreo).toHaveBeenCalledOnce();
  });

  it("cancela también la suscripción de WooCommerce que el cliente arrastra", async () => {
    mockBuscarCliente.mockResolvedValue(cliente({ renovacionAutoWooDesde: "2025-01-01" }));

    // Sin fila Oneclick: el cobro automático vive solo en WooCommerce.
    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: false, woo: true });
    expect(mockCancelarWoo).toHaveBeenCalledWith("VLXV14", "o@x.cl");
    expect(mockSuspender).not.toHaveBeenCalled();
  });

  it("si WooCommerce falla igual deja anulado el cobro local y manda el respaldo", async () => {
    mockBuscarCliente.mockResolvedValue(cliente({ renovacionAutoWooDesde: "2025-01-01" }));
    mockObtenerSuscripcion.mockResolvedValue({ id: "s1", estado: "suspendida" });
    mockCancelarWoo.mockRejectedValue(new Error("403 site lock"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { anularSuscripcion } = await import("./oneclick");
    expect(await anularSuscripcion("c1")).toEqual({ oneclick: true, woo: false });
    expect(mockCorreo).toHaveBeenCalledOnce();
  });
});
