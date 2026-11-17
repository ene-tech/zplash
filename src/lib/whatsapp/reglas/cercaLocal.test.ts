import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, ReglaWhatsapp } from "@/types";

const h = vi.hoisted(() => ({
  reglas: [] as ReglaWhatsapp[],
  clientes: new Map<string, Cliente>(),
  enHorario: true,
  registrar: vi.fn(),
  ejecutar: vi.fn(),
  // Respuestas en orden de las consultas de yaTieneOfertaCercaLocal:
  // [disparo previo de otra regla, descuento vigente].
  consultas: [] as unknown[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/fcm", () => ({ fcmConfigurado: () => true }));
vi.mock("@/db", () => {
  const cadena = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "from", "where"]) c[m] = () => c;
    c.limit = async () => h.consultas.shift() ?? [];
    return c;
  };
  return { getDb: () => cadena() };
});

vi.mock("@/lib/dataAccess/whatsapp", () => ({
  listarReglasWhatsappActivas: vi.fn(async () => h.reglas),
  registrarDisparoReglaWhatsapp: h.registrar,
  marcarDisparoReglaWhatsapp: vi.fn(async () => {}),
}));
vi.mock("@/lib/dataAccess/config", () => ({ getConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/helpers")>()),
  dentroDeHorarioOperador: () => h.enHorario,
}));
vi.mock("./motor", () => ({
  MS_POR_DIA: 86_400_000,
  buscarCliente: vi.fn(async (id: string) => h.clientes.get(id) ?? null),
  ejecutarAccionRegla: h.ejecutar,
  promoVipParaCliente: vi.fn(),
}));

import { evaluarReglasCercaLocal } from "./disparadores";

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const regla = (id: string, d: number) => ({ id, nombre: id, tipoEvento: "cerca_local", condicionDiasAntesVencimiento: d }) as ReglaWhatsapp;
const cliente = (id: string, extra: Partial<Cliente>) => ({ id, patente: id.toUpperCase(), ...extra }) as Cliente;

describe("evaluarReglasCercaLocal", () => {
  beforeEach(() => {
    h.reglas = [regla("r10", 10), regla("r30", 30)];
    h.clientes.clear();
    h.enHorario = true;
    h.registrar.mockReset().mockImplementation(async (d) => d);
    h.ejecutar.mockReset().mockResolvedValue(undefined);
    h.consultas = [];
  });

  it("no repite en la misma ausencia aunque ahora califique otra regla, ni apila con un descuento vigente", async () => {
    h.clientes.set("a", cliente("a", { ultimaVisita: dias(40) }));
    h.consultas = [[{ id: "disparo-r10" }]];
    expect(await evaluarReglasCercaLocal(["a"])).toBe(0);
    h.consultas = [[], [{ id: "cupon-vuelve" }]];
    expect(await evaluarReglasCercaLocal(["a"])).toBe(0);
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("ignora reglas con 0 días", async () => {
    h.reglas = [regla("r0", 0)];
    h.clientes.set("a", cliente("a", { ultimaVisita: dias(1) }));
    expect(await evaluarReglasCercaLocal(["a"])).toBe(0);
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("usa solo la regla de umbral más alto que cumple, una vez por ausencia", async () => {
    h.clientes.set("a", cliente("a", { ultimaVisita: dias(40) }));
    expect(await evaluarReglasCercaLocal(["a"])).toBe(1);
    expect(h.ejecutar).toHaveBeenCalledTimes(1);
    expect(h.ejecutar.mock.calls[0][0].id).toBe("r30");
    expect(h.registrar.mock.calls[0][0].origenId).toBe(`a:${h.clientes.get("a")!.ultimaVisita}`);
  });

  it("no ofrece nada a quien vino hace poco, nunca vino o tiene plan vigente", async () => {
    const enUnMes = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    h.clientes.set("b", cliente("b", { ultimaVisita: dias(3) }));
    h.clientes.set("c", cliente("c", {}));
    h.clientes.set("d", cliente("d", { ultimaVisita: dias(40), vencimiento: enUnMes }));
    expect(await evaluarReglasCercaLocal(["b", "c", "d"])).toBe(0);
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("fuera de horario no gasta el disparo", async () => {
    h.enHorario = false;
    h.clientes.set("a", cliente("a", { ultimaVisita: dias(40) }));
    expect(await evaluarReglasCercaLocal(["a"])).toBe(0);
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it("si el disparo ya existía (ya se le ofreció), no reenvía", async () => {
    h.registrar.mockResolvedValue(null);
    h.clientes.set("a", cliente("a", { ultimaVisita: dias(40) }));
    expect(await evaluarReglasCercaLocal(["a"])).toBe(0);
    expect(h.ejecutar).not.toHaveBeenCalled();
  });
});
