import { describe, expect, it, vi } from "vitest";
import { avanzarCola, ESPERA_MAXIMA_MS, MAX_INTENTOS, type ItemCola, type MetaContenido } from "./colaContenido";

const ahora = new Date("2026-11-11T16:00:00Z");
const item = (extra: Partial<ItemCola> = {}): ItemCola => ({
  video: "videos/a.mp4",
  caption: "hola",
  desde: "2026-11-11T15:30:00Z",
  ...extra,
});
const metaCon = (status_code = "FINISHED"): MetaContenido => ({
  crearContenedor: vi.fn(async () => "c1"),
  estado: vi.fn(async () => ({ status_code })),
  publicar: vi.fn(async () => "p1"),
});
const correr = (cola: ItemCola[], meta: MetaContenido, cuando = ahora) =>
  avanzarCola(cola, cuando, meta, async (r) => `https://firmada/${r}`, async () => {});

describe("avanzarCola", () => {
  it("no toca un video cuya hora no llegó", async () => {
    const meta = metaCon();
    expect(await correr([item({ desde: "2026-11-12T15:30:00Z" })], meta)).toBe("nada pendiente");
    expect(meta.crearContenedor).not.toHaveBeenCalled();
  });

  it("crea el reel con caption, lo publica y después hace la historia sin caption", async () => {
    const cola = [item()];
    const meta = metaCon();
    await correr(cola, meta);
    expect(meta.crearContenedor).toHaveBeenLastCalledWith("REELS", "https://firmada/videos/a.mp4", "hola");
    await correr(cola, meta);
    expect(cola[0].reel?.id).toBe("p1");
    await correr(cola, meta);
    expect(meta.crearContenedor).toHaveBeenLastCalledWith("STORIES", "https://firmada/videos/a.mp4", undefined);
    await correr(cola, meta);
    expect(cola[0].historia?.id).toBe("p1");
    expect(await correr(cola, meta)).toBe("nada pendiente");
  });

  it("espera mientras Meta procesa", async () => {
    const cola = [item({ reel: { contenedor: "c1", creadoEn: ahora.toISOString(), intentos: 0 } })];
    const meta = metaCon("IN_PROGRESS");
    expect(await correr(cola, meta)).toContain("procesando");
    expect(meta.publicar).not.toHaveBeenCalled();
  });

  it("reintenta con contenedor nuevo y se rinde al tercer fallo, sin trabar al siguiente", async () => {
    const cola = [item(), item({ video: "videos/b.mp4" })];
    const meta = metaCon("ERROR");
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await correr(cola, meta); // crea
      await correr(cola, meta); // ERROR
    }
    expect(cola[0].error).toContain("reel");
    expect(meta.crearContenedor).toHaveBeenCalledTimes(MAX_INTENTOS);
    await correr(cola, meta);
    expect(cola[1].reel?.contenedor).toBe("c1");
  });

  it("si falla al publicar reintenta con el mismo contenedor, sin crear otro", async () => {
    const cola = [item({ reel: { contenedor: "c1", creadoEn: ahora.toISOString(), intentos: 0 } })];
    const meta = metaCon();
    vi.mocked(meta.publicar).mockRejectedValueOnce(new Error("timeout"));
    expect(await correr(cola, meta)).toContain("falló");
    expect(cola[0].reel?.contenedor).toBe("c1");
    await correr(cola, meta);
    expect(meta.crearContenedor).not.toHaveBeenCalled();
    expect(cola[0].reel?.id).toBe("p1");
  });

  it("si publicó pero no pudo guardar, no reintenta", async () => {
    const cola = [item({ reel: { contenedor: "c1", creadoEn: ahora.toISOString(), intentos: 0 } })];
    const guardar = vi.fn(async () => {
      throw new Error("storage caído");
    });
    await expect(avanzarCola(cola, ahora, metaCon(), async (r) => r, guardar)).rejects.toThrow("storage caído");
    expect(cola[0].reel?.contenedor).toBe("c1");
    expect(cola[0].reel?.intentos).toBe(0);
  });

  it("da por perdido un contenedor que no termina en una hora", async () => {
    const creado = new Date(ahora.getTime() - ESPERA_MAXIMA_MS - 1000).toISOString();
    const cola = [item({ reel: { contenedor: "c1", creadoEn: creado, intentos: 0 } })];
    expect(await correr(cola, metaCon("IN_PROGRESS"))).toContain("falló");
    expect(cola[0].reel?.contenedor).toBeUndefined();
  });
});
