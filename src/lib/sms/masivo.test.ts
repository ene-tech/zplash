import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, Cupon } from "@/types";

// Reintentar una campaña de SMS vuelve a pasar a quienes les falló el envío.
// Antes cada reintento les emitía un cupón nuevo (y válido) además del que ya
// tenían del intento anterior; ahora se les reenvía el mismo.

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("el test no debería tocar la base");
  },
}));

let clientes: Cliente[] = [];
let cuponesPrevios: Cupon[] = [];
let generadosPara: string[] = [];
const textosEnviados: string[] = [];

vi.mock("@/lib/dataAccess", () => ({
  getClientesByIds: () => Promise.resolve(clientes),
  clienteIdsConSmsDeCampana: () => Promise.resolve([]),
  cuponesVigentesDeLote: () => Promise.resolve(cuponesPrevios),
  getConfig: () => Promise.resolve({}),
}));
vi.mock("@/lib/whatsapp/masivo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/masivo")>()),
  generarCuponesMasivos: (dest: Cliente[]) => {
    generadosPara = dest.map((d) => d.patente);
    return Promise.resolve(new Map(dest.map((d) => [d.id, { codigo: `NUEVO-${d.patente}`, valor: 3000 } as Cupon])));
  },
}));
vi.mock("./enviar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./enviar")>()),
  enviarSms: ({ texto }: { texto: string }) => {
    textosEnviados.push(texto);
    return Promise.resolve({ ok: true });
  },
}));

import { enviarMensajesMasivosSms } from "./masivo";

const cliente = (id: string, patente: string) => ({ id, patente, nombre: "Ana", telefono: "+56912345678" }) as Cliente;

describe("enviarMensajesMasivosSms — reintento con cupón", () => {
  beforeEach(() => {
    clientes = [cliente("c1", "AAAA11"), cliente("c2", "BBBB22")];
    cuponesPrevios = [];
    generadosPara = [];
    textosEnviados.length = 0;
  });

  it("reusa el cupón vigente del lote y solo emite para quien no tiene", async () => {
    cuponesPrevios = [{ codigo: "PREVIO-A", valor: 2000, patenteAsignada: "AAAA11" } as Cupon];
    const r = await enviarMensajesMasivosSms({
      campana: "prueba",
      texto: "Descuento {{montoOferta}}",
      clienteIds: ["c1", "c2"],
      accion: "cupon_descuento",
      cuponValor: 3000,
    });
    expect(generadosPara).toEqual(["BBBB22"]);
    expect(textosEnviados).toEqual(["Descuento $2.000", "Descuento $3.000"]);
    expect(r.enviados).toBe(2);
  });

  it("sin cupón en la campaña no busca ni emite nada", async () => {
    cuponesPrevios = [{ codigo: "PREVIO-A", patenteAsignada: "AAAA11" } as Cupon];
    await enviarMensajesMasivosSms({ campana: "prueba", texto: "Hola {{nombre}}", clienteIds: ["c1", "c2"] });
    expect(textosEnviados).toEqual(["Hola Ana", "Hola Ana"]);
  });
});
