import { beforeEach, describe, expect, it, vi } from "vitest";

// Lo que se fija acá es el flujo de quien llega desde un anuncio de Meta:
// recibe horario + invitación al descuento, y el cupón final queda en el lote
// del anuncio (no en el de la Opción 5) para poder medir la campaña.
let clientesEnBase: { id: string }[] = [];
// select().from(precios) se espera directo; select().from(clientes).where().limit() es la búsqueda de cliente.
const filasPrecios = [
  { plan: "Lavado único", normal: 9990, promo: 0 },
  { plan: "Solo túnel (sin aspirado)", normal: 6990, promo: 0 },
];
const fakeDb = {
  select: () => ({
    from: () => Object.assign(Promise.resolve(filasPrecios), { where: () => ({ limit: () => Promise.resolve(clientesEnBase) }) }),
  }),
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
        textoDescuentoPedirNombre: "NOMBRE?",
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

import { esConsultaDuranteRegistro, iniciarDesdeAnuncio, responderMensaje } from "./router";
import { cuponValeEnSoloTunel, LOTE_ANUNCIO_META } from "@/lib/helpers";
import type { ConversacionWhatsapp, FlowStateWhatsapp } from "@/types";

const conv = (extra: Partial<ConversacionWhatsapp> = {}) =>
  ({ id: "conv1", telefono: "+56911111111", ultimoMensajeEn: "", noLeidos: 0, creadoEn: "", ...extra }) as ConversacionWhatsapp;

describe("iniciarDesdeAnuncio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientesEnBase = [];
  });

  it("número nuevo: horario + precios con descuento + invitación, y abre el registro marcado como anuncio", async () => {
    const r = await iniciarDesdeAnuncio(conv(), "+56911111111");
    expect(r.texto).toBe(
      "HORARIO\n\n💰 *Su primer lavado con el código de $2.000*\n• Lavado exterior, sin aspirado autoservicio: *$4.990* (normal $6.990)\n• Lavado exterior + aspirado autoservicio: *$7.990* (normal $9.990)\n\nRegalo $2.000 por 10 días. Su nombre:"
    );
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
    expect(r?.texto).toMatch(/^Código ABC123\n\n💰 [\s\S]*\$4\.990[\s\S]*\$7\.990/);
    expect(emitirCupon).toHaveBeenCalledWith(expect.objectContaining({ nombreLote: LOTE_ANUNCIO_META, patente: "ABCD12", valor: 2000 }));
  });
});

describe("registro del descuento: nombre vs otra consulta", () => {
  beforeEach(() => vi.clearAllMocks());

  // Respuestas reales a "indíqueme su nombre" (ago-oct 2026).
  it("una consulta suelta el flujo; un nombre no", () => {
    for (const t of ["El lavado de chasis", "Y el lavado de chazis", "¿dónde están?", "cuanto vale"]) expect(esConsultaDuranteRegistro(t, "nombre")).toBe(true);
    for (const t of ["ANDRES EDUARDO MONTALBA CERDA", "Ayline Jara San Martin", "Stephanie", "Hola, soy Juan", "Ok"])
      expect(esConsultaDuranteRegistro(t, "nombre")).toBe(false);
  });

  it("al pedir patente o correo, el dato con palabras de consulta sigue siendo la respuesta", () => {
    expect(esConsultaDuranteRegistro("mi auto es AB1234", "patente")).toBe(false);
    expect(esConsultaDuranteRegistro("info@empresa.cl", "mail")).toBe(false);
    expect(esConsultaDuranteRegistro("juan.lavado@gmail.com", "mail")).toBe(false);
    expect(esConsultaDuranteRegistro("¿y cuánto vale el lavado?", "patente")).toBe(true);
  });

  it("'Ok', un número o el RUT vuelven a pedir el nombre sin avanzar", async () => {
    const estado: FlowStateWhatsapp = { tipo: "registro_descuento", paso: "nombre" };
    for (const t of ["Ok", "4", "19306276-8"]) {
      const r = await responderMensaje(t, "+56911111111", conv({ flowState: estado }));
      expect(r?.texto).toBe("NOMBRE?");
    }
    expect(flowState).not.toHaveBeenCalled();
  });
});

describe("cuponValeEnSoloTunel", () => {
  it("solo el descuento de primera vez del bot, en monto fijo", () => {
    expect(cuponValeEnSoloTunel({ nombreLote: LOTE_ANUNCIO_META, esPorcentaje: false })).toBe(true);
    expect(cuponValeEnSoloTunel({ nombreLote: "WhatsApp - Primera vez", esPorcentaje: false })).toBe(true);
    expect(cuponValeEnSoloTunel({ nombreLote: "Próxima visita", esPorcentaje: false })).toBe(true);
    expect(cuponValeEnSoloTunel({ nombreLote: LOTE_ANUNCIO_META, esPorcentaje: true })).toBe(false);
    expect(cuponValeEnSoloTunel({ nombreLote: "Campaña Vuelve", esPorcentaje: false })).toBe(false);
  });
});
