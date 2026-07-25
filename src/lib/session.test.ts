import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// session.ts guarda la sesión en una cookie firmada con HMAC (ver comentario
// al inicio de ese archivo): estos tests solo cubren esa capa criptográfica
// (firmar/verificar/expirar), que es la que de verdad protege contra
// forjar o alterar una sesión. sesionVigente()/tieneModulo() también tocan
// la base de datos (claveVersion) y quedan fuera de esta pasada — mockear
// @/db introduciría un patrón que hoy no existe en el repo.
const cookieJar = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => cookieJar.set(name, { value }),
    get: (name: string) => cookieJar.get(name),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

const PERFIL = { id: "p1", nombre: "Operador Test", modulos: ["clientes"] as const, claveVersion: 1 };

beforeEach(() => {
  cookieJar.clear();
  process.env.SESSION_SECRET = "test-secret";
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("crearSesion / leerSesion", () => {
  it("round-trip: lo que se firma es lo que se lee de vuelta", async () => {
    const { crearSesion, leerSesion } = await import("./session");
    await crearSesion({ ...PERFIL, modulos: [...PERFIL.modulos] });
    const sesion = await leerSesion();
    expect(sesion).toMatchObject({ id: "p1", nombre: "Operador Test", modulos: ["clientes"] });
  });

  it("devuelve null si la cookie no existe", async () => {
    const { leerSesion } = await import("./session");
    expect(await leerSesion()).toBeNull();
  });

  it("devuelve null si la firma no matchea el payload (cookie alterada)", async () => {
    const { crearSesion, leerSesion } = await import("./session");
    await crearSesion({ ...PERFIL, modulos: [...PERFIL.modulos] });
    const cookie = cookieJar.get("zplash_sesion")!;
    const separador = cookie.value.lastIndexOf(".");
    const payload = cookie.value.slice(0, separador);
    // Payload alterado a mano, sin volver a firmar — simula un intento de
    // forjar la cookie (ej. agregarse un módulo que no se tiene).
    const payloadFalso = Buffer.from(JSON.stringify({ id: "otro", nombre: "x", modulos: ["permisos"], claveVersion: 1, exp: Date.now() + 1000 })).toString(
      "base64url"
    );
    cookieJar.set("zplash_sesion", { value: `${payloadFalso}${cookie.value.slice(separador)}` });
    expect(await leerSesion()).toBeNull();
    void payload;
  });

  it("devuelve null si la firma tiene un largo distinto (no solo distinta)", async () => {
    const { crearSesion, leerSesion } = await import("./session");
    await crearSesion({ ...PERFIL, modulos: [...PERFIL.modulos] });
    const cookie = cookieJar.get("zplash_sesion")!;
    cookieJar.set("zplash_sesion", { value: `${cookie.value}extra` });
    expect(await leerSesion()).toBeNull();
  });

  it("devuelve null si la sesión ya venció", async () => {
    vi.useFakeTimers();
    const { crearSesion, leerSesion } = await import("./session");
    await crearSesion({ ...PERFIL, modulos: [...PERFIL.modulos] });
    vi.advanceTimersByTime(13 * 60 * 60 * 1000); // más de las 12h de DURACION_MS
    expect(await leerSesion()).toBeNull();
  });
});

describe("cerrarSesion", () => {
  it("saca la cookie de sesión", async () => {
    const { crearSesion, cerrarSesion, leerSesion } = await import("./session");
    await crearSesion({ ...PERFIL, modulos: [...PERFIL.modulos] });
    await cerrarSesion();
    expect(await leerSesion()).toBeNull();
  });
});
