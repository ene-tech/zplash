import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá: un cargo que Transbank aprobó nunca puede quedar sin
// rastro ni repetirse. "No sé" (timeout, Transbank caído) no es "rechazado".

const authorize = vi.fn();
const status = vi.fn();
vi.mock("@/lib/transbank", () => ({
  oneclickTransaction: () => ({ authorize: (...a: unknown[]) => authorize(...a), status: (...a: unknown[]) => status(...a) }),
  oneclickChildCommerceCode: () => "597055555542",
}));
// Los "rechazada" de la reconciliación van con commit propio (getDb(), no el
// tx): se anotan en `sets`, y `setsEnTx` deja ver que NO pasaron por el tx.
const sets: Record<string, unknown>[] = [];
const setsEnTx: Record<string, unknown>[] = [];
vi.mock("@/db", () => ({
  getDb: () => ({ update: () => ({ set: (v: Record<string, unknown>) => ({ where: () => (sets.push(v), Promise.resolve()) }) }) }),
}));

import { autorizarCobro, MSG_COBRO_SIN_CONFIRMAR, reconciliarCobrosEnCurso } from "./oneclickCobro";

const aprobado = { details: [{ response_code: 0, authorization_code: "a1" }] };

describe("autorizarCobro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve el detalle de Transbank", async () => {
    authorize.mockResolvedValue(aprobado);
    expect(await autorizarCobro("u", "t", "oc1", 19990)).toEqual({ response_code: 0, authorization_code: "a1" });
    expect(status).not.toHaveBeenCalled();
  });

  it("si authorize tira, pregunta el estado: un timeout que sí cobró cuenta como aprobado", async () => {
    authorize.mockRejectedValue(new Error("timeout"));
    status.mockResolvedValue(aprobado);
    expect(await autorizarCobro("u", "t", "oc1", 19990)).toEqual({ response_code: 0, authorization_code: "a1" });
  });

  it("si tampoco contesta el estado, tira (no es un rechazo: no hay aviso de cobro fallido)", async () => {
    authorize.mockRejectedValue(new Error("timeout"));
    status.mockRejectedValue(new Error("caído"));
    await expect(autorizarCobro("u", "t", "oc1", 19990)).rejects.toThrow(MSG_COBRO_SIN_CONFIRMAR);
  });
});

describe("reconciliarCobrosEnCurso", () => {
  const txCon = (filas: { id: string; creadoEn: string; monto?: number }[]) =>
    ({
      select: () => ({ from: () => ({ where: () => Promise.resolve(filas) }) }),
      update: () => ({ set: (v: Record<string, unknown>) => ({ where: () => (setsEnTx.push(v), Promise.resolve()) }) }),
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    sets.length = 0;
    setsEnTx.length = 0;
  });

  // El bucle de oct-2026: si el "rechazada" iba en el tx y el cobro siguiente
  // tampoco tenía respuesta, el rollback lo deshacía y los en_curso se
  // acumulaban. Tiene que sobrevivir a lo que pase después.
  it("el rechazada de un huérfano va con commit propio, no en la transacción", async () => {
    status.mockRejectedValue(new Error("no existe"));
    const haceCuatroDias = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    await reconciliarCobrosEnCurso(txCon([{ id: "oc1", creadoEn: haceCuatroDias }]), "s1");
    expect(sets).toEqual([expect.objectContaining({ estado: "rechazada", responseCode: null })]);
    expect(setsEnTx).toEqual([]);
  });

  it("un huérfano que Transbank aprobó se devuelve para aplicarlo como pago", async () => {
    status.mockResolvedValue(aprobado);
    const recuperados = await reconciliarCobrosEnCurso(txCon([{ id: "oc1", creadoEn: new Date().toISOString(), monto: 19990 }]), "s1");
    expect(recuperados).toEqual([{ id: "oc1", monto: 19990, authorizationCode: "a1" }]);
    expect(sets).toEqual([]);
  });

  it("un huérfano que Transbank rechazó queda rechazada", async () => {
    status.mockResolvedValue({ details: [{ response_code: -1 }] });
    await reconciliarCobrosEnCurso(txCon([{ id: "oc1", creadoEn: new Date().toISOString() }]), "s1");
    expect(sets).toEqual([expect.objectContaining({ estado: "rechazada" })]);
  });

  it("sin respuesta de Transbank y reciente: no deja cobrar de nuevo", async () => {
    status.mockRejectedValue(new Error("caído"));
    await expect(reconciliarCobrosEnCurso(txCon([{ id: "oc1", creadoEn: new Date().toISOString() }]), "s1")).rejects.toThrow();
    expect(sets).toEqual([]);
  });

  it("sin respuesta pasados 3 días: se da por no cobrado para no trabar la suscripción", async () => {
    status.mockRejectedValue(new Error("no existe"));
    const haceCuatroDias = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    await reconciliarCobrosEnCurso(txCon([{ id: "oc1", creadoEn: haceCuatroDias }]), "s1");
    expect(sets).toEqual([expect.objectContaining({ estado: "rechazada" })]);
  });
});
