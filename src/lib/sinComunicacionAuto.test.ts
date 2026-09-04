import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, ReglaCorreo, ReglaWhatsapp } from "@/types";

// El opt-out por cliente ("Recibe mensajes automáticos" en la ficha, ver
// sinComunicacionAuto en @/db/schema/clientes) es un solo `if` en cada motor
// de reglas. Lo que se fija acá es que ese if esté ANTES del envío: al cliente
// marcado no le sale ni el WhatsApp ni el correo, y el disparo queda marcado
// (no "programado") para que el cron no se lo reintente al día siguiente.

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("el test no debería tocar la base");
  },
}));

const marcadosWhatsapp: string[] = [];
const marcadosCorreo: string[] = [];
const enviosWhatsapp: string[] = [];
const enviosCorreo: string[] = [];

vi.mock("@/lib/dataAccess/whatsapp", () => ({
  marcarDisparoReglaWhatsapp: (_id: string, cambios: { estado: string }) => {
    marcadosWhatsapp.push(cambios.estado);
    return Promise.resolve();
  },
  obtenerPlantillaWhatsapp: () => Promise.resolve({ id: "p1", mensaje: "hola {{nombre}}", metaNombre: "t1", metaIdioma: "es" }),
}));
vi.mock("@/lib/dataAccess/cupones", () => ({ upsertCupones: () => Promise.resolve(true) }));
vi.mock("@/lib/dataAccess/clientes", () => ({
  clienteFromRow: (r: unknown) => r,
  limpiarEmailCliente: () => Promise.resolve(true),
}));
vi.mock("@/lib/push/enviar", () => ({ enviarPush: () => Promise.resolve(false) }));
vi.mock("@/lib/whatsapp/enviar", () => ({
  enviarMensajePlantilla: (telefono: string) => {
    enviosWhatsapp.push(telefono);
    return Promise.resolve({ id: "m1", estado: "enviado" });
  },
}));
vi.mock("@/lib/dataAccess/mail", () => ({
  obtenerPlantillaCorreo: () => Promise.resolve({ id: "p1", asunto: "hola", cuerpo: "hola", activo: true }),
  marcarDisparoReglaCorreo: (_id: string, cambios: { estado: string }) => {
    marcadosCorreo.push(cambios.estado);
    return Promise.resolve();
  },
  eliminarDisparoReglaCorreo: () => Promise.resolve(),
}));
vi.mock("@/lib/mailing/proveedor", () => ({
  enviarCorreoTransaccional: (opts: { to: string }) => {
    enviosCorreo.push(opts.to);
    return Promise.resolve({ ok: true });
  },
}));

import { ejecutarAccionRegla } from "@/lib/whatsapp/reglas/motor";
import { ejecutarAccionReglaCorreo } from "@/lib/mailing/reglas/motor";

const CLIENTE = {
  id: "c1",
  nombre: "Ana",
  patente: "SZGH65",
  telefono: "+56912345678",
  email: "ana@ejemplo.cl",
  creadoEn: "2026-01-01T00:00:00.000Z",
} as Cliente;

const REGLA_WHATSAPP = { id: "r1", nombre: "Vence pronto", plantillaWhatsappId: "p1", accion: "mensaje_simple" } as ReglaWhatsapp;
const REGLA_CORREO = { id: "r1", nombre: "Vence pronto", plantillaCorreoId: "p1" } as ReglaCorreo;

beforeEach(() => {
  marcadosWhatsapp.length = 0;
  marcadosCorreo.length = 0;
  enviosWhatsapp.length = 0;
  enviosCorreo.length = 0;
});

describe("cliente marcado sin comunicación automática", () => {
  it("no recibe la plantilla de WhatsApp y su disparo no queda programado", async () => {
    await ejecutarAccionRegla(REGLA_WHATSAPP, "d1", { ...CLIENTE, sinComunicacionAuto: true });
    expect(enviosWhatsapp).toEqual([]);
    expect(marcadosWhatsapp).toEqual(["error"]);
  });

  it("no recibe el correo de la regla", async () => {
    const enviado = await ejecutarAccionReglaCorreo(REGLA_CORREO, "d1", { ...CLIENTE, sinComunicacionAuto: true }, {});
    expect(enviado).toBe(false);
    expect(enviosCorreo).toEqual([]);
    expect(marcadosCorreo).toEqual(["error"]);
  });
});

describe("cliente sin la marca (todos los de hoy)", () => {
  it("sigue recibiendo el WhatsApp", async () => {
    await ejecutarAccionRegla(REGLA_WHATSAPP, "d1", CLIENTE);
    expect(enviosWhatsapp).toEqual([CLIENTE.telefono]);
  });

  it("sigue recibiendo el correo", async () => {
    await ejecutarAccionReglaCorreo(REGLA_CORREO, "d1", CLIENTE, {});
    expect(enviosCorreo).toEqual([CLIENTE.email]);
  });
});
