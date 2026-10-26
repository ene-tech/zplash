import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es el flujo de quien llega desde un anuncio de Meta:
// recibe horario + invitación al descuento, y el cupón final queda en el lote
// del anuncio (no en el de la Opción 5) para poder medir la campaña.
let clientesEnBase: { id: string }[] = [];
const fakeDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(clientesEnBase) }) }) }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));

const flowState = vi.fn();
const emitirCupon = vi.fn();
vi.mock("@/lib/dataAccess", () => ({
  getConfig: () =>
    Promise.resolve({
      descuentoPrimeraVezValor: 2000,
      descuentoPrimeraVezDiasValidez: 10,
      textosBotWhatsapp: {
        horarioUbicacion: "HORARIO",
        menuPrincipal: "MENU",
        textoDescuentoInstrucciones: "Regalo {{monto}} por {{dias}} días. Su nombre:",
        textoDescuentoPedirPatente: "PATENTE?",
        textoDescuentoPedirMail: "MAIL?",
        textoDescuentoConfirmacion: "Código {{codigo}}",
      },
    }),
  actualizarFlowStateConversacion: (id: string, estado: unknown) => flowState(id, estado),
  emitirCuponDescuentoPrimeraVez: (args: unknown) => {
    emitirCupon(args);
    return Promise.resolve({ codigo: "ABC123", fechaCaducidad: new Date().toISOString(), valor: 2000 });
  },
  upsertClientes: () => Promise.resolve(),
  vincularClienteConversacion: () => Promise.resolve(),
}));

import { iniciarDesdeAnuncio, LOTE_ANUNCIO, responderMensaje } from "./router";
import type { ConversacionWhatsapp, FlowStateWhatsapp } from "@/types";

const conv = (extra: Partial<ConversacionWhatsapp> = {}) =>
  ({ id: "conv1", telefono: "+56911111111", ultimoMensajeEn: "", noLeidos: 0, creadoEn: "", ...extra }) as ConversacionWhatsapp;

describe("iniciarDesdeAnuncio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientesEnBase = [];
  });

  it("número nuevo: horario + invitación, y abre el registro marcado como anuncio", async () => {
    const r = await iniciarDesdeAnuncio(conv(), "+56911111111");
    expect(r.texto).toBe("HORARIO\n\nRegalo $2.000 por 10 días. Su nombre:");
    expect(flowState).toHaveBeenCalledWith("conv1", { tipo: "registro_descuento", paso: "nombre", origen: "anuncio" });
  });

  it("ya es cliente: horario + menú, sin flujo de descuento", async () => {
    clientesEnBase = [{ id: "c1" }];
    const r = await iniciarDesdeAnuncio(conv(), "+56911111111");
    expect(r.texto).toBe("HORARIO\n\nMENU");
    expect(flowState).not.toHaveBeenCalled();
  });

  it("el origen se arrastra por los pasos y el cupón sale en el lote del anuncio", async () => {
    const estado: FlowStateWhatsapp = { tipo: "registro_descuento", paso: "nombre", origen: "anuncio" };
    await responderMensaje("Ana Pérez", "+56911111111", conv({ flowState: estado }));
    expect(flowState).toHaveBeenLastCalledWith("conv1", { ...estado, paso: "patente", nombre: "Ana Pérez" });

    const r = await responderMensaje("ana@ejemplo.cl", "+56911111111", conv({ flowState: { ...estado, paso: "mail", nombre: "Ana Pérez", patente: "ABCD12" } }));
    expect(r?.texto).toBe("Código ABC123");
    expect(emitirCupon).toHaveBeenCalledWith(expect.objectContaining({ nombreLote: LOTE_ANUNCIO, patente: "ABCD12", valor: 2000 }));
  });
});
