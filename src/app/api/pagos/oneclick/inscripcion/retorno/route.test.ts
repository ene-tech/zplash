import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá: el primer cobro de una tarjeta recién inscrita usa la
// promoción que le calza al cliente, y "Sin plan" (nunca contrató, vencimiento
// nulo) también tiene una — el upgrade desde el lavado único que acaba de
// pagar. Ese cliente ve el botón de upgrade en Mi Cuenta, no tiene tarjeta
// guardada, así que el pago pasa por acá: si esta ruta lo trata como
// contratación normal, le cobra el plan completo en vez de la diferencia.

let suscripcionEnBase: Record<string, unknown> = {};
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([suscripcionEnBase]) }) }) }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));

vi.mock("@/lib/transbank", () => ({
  oneclickInscription: () => ({
    finish: () => Promise.resolve({ response_code: 0, tbk_user: "tbk1", card_type: "Visa", card_number: "4321" }),
  }),
}));

const mockCliente = vi.fn();
vi.mock("@/lib/dataAccess/clientes", () => ({ buscarClientePorPatente: () => mockCliente() }));

const mockOferta = vi.fn();
vi.mock("@/lib/dataAccess/ofertasPlan", () => ({ calcularOfertasPlanDeCliente: () => mockOferta() }));

const cobrarOferta = vi.fn<(patente: string, tipo: string, monto: number) => Promise<{ estado: string }>>();
const cobrarSuscripcion = vi.fn(() => Promise.resolve({ estado: "aprobada" }));
cobrarOferta.mockResolvedValue({ estado: "aprobada" });
vi.mock("@/lib/pagos", () => ({
  cobrarOfertaOneclick: (patente: string, tipo: string, monto: number) => cobrarOferta(patente, tipo, monto),
  cobrarSuscripcion: () => cobrarSuscripcion(),
  otorgarTicketReactivacion: () => Promise.resolve(null),
  cancelarSuscripcionWooCommerceLegacy: () => Promise.resolve({ cancelada: false }),
  migrarDeWooCommerceLegacy: () => {},
}));

import { GET } from "./route";

function retorno() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET({ nextUrl: new URL("https://zplash.cl/api/pagos/oneclick/inscripcion/retorno?TBK_TOKEN=t1") } as any);
}

describe("GET /api/pagos/oneclick/inscripcion/retorno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suscripcionEnBase = { id: "s1", patente: "AB1234", email: "ana@ejemplo.cl", estado: "pendiente", username: "AB1234" };
    mockOferta.mockResolvedValue({});
  });

  it("cliente sin plan con upgrade vigente -> el primer cobro es la diferencia, no el plan completo", async () => {
    mockCliente.mockResolvedValue({ id: "c1", patente: "AB1234", plan: "", vencimiento: null });
    mockOferta.mockResolvedValue({ upgrade: { precio: 12000 } });

    await retorno();

    expect(cobrarOferta).toHaveBeenCalledWith("AB1234", "upgrade_plan", 12000);
    expect(cobrarSuscripcion).not.toHaveBeenCalled();
  });

  it("cliente vencido con promo de reactivación -> cobra la promo", async () => {
    mockCliente.mockResolvedValue({ id: "c1", patente: "AB1234", plan: "Plan X5", vencimiento: "2020-01-01" });
    mockOferta.mockResolvedValue({ reactivacion: { precio: 15990 } });

    await retorno();

    expect(cobrarOferta).toHaveBeenCalledWith("AB1234", "reactivacion", 15990);
  });

  it("cliente con plan vigente -> cobra el ciclo normal, sin calcular ofertas", async () => {
    const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString();
    mockCliente.mockResolvedValue({ id: "c1", patente: "AB1234", plan: "Plan X5", vencimiento: enUnMes });

    await retorno();

    expect(cobrarSuscripcion).toHaveBeenCalled();
    expect(cobrarOferta).not.toHaveBeenCalled();
    expect(mockOferta).not.toHaveBeenCalled();
  });
});
