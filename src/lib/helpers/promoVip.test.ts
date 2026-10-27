import { describe, expect, it } from "vitest";
import {
  PROMO_RECOMPRA_2_KEY,
  PROMO_VIP_KEY,
  cuponesPromoLavados,
  cuponesPromoRecompra2,
  cuponesPromoVip,
  libresVipDePatente,
  ofertaPromoVip,
  ventanaRecompraPack,
} from "@/lib/helpers";
import type { Cupon } from "@/types";

const compra = new Date("2026-10-01T12:00:00.000Z");

function packDeCuatro(): Cupon[] {
  return cuponesPromoLavados({
    promo: "promo_5_lavados",
    patente: "AB1234",
    precio: 19990,
    existentes: new Set(),
    creadoPor: "Op",
    idBase: "cup1",
    ahora: compra,
  });
}

const usar = (c: Cupon, fecha: string): Cupon => ({ ...c, usado: true, fechaUso: fecha });

describe("cuponesPromoVip", () => {
  it("emite 4 tickets para la patente y 1 libre, todos de 30 días", () => {
    const t = cuponesPromoVip({ patente: "ab-1234", precio: 19990, existentes: new Set(), creadoPor: "Op", idBase: "v", ahora: compra });
    expect(t).toHaveLength(5);
    expect(t.map((c) => c.nombreLote)).toEqual(Array(5).fill(PROMO_VIP_KEY));
    expect(t.slice(0, 4).every((c) => c.patentesAutorizadas?.[0] === "AB1234")).toBe(true);
    expect(t[4].patentesAutorizadas).toBeUndefined();
    expect(t[4].patenteAsignada).toBe("AB1234");
    expect(t[0].fechaCaducidad).toBe("2026-10-31T12:00:00.000Z");
    expect(new Set(t.map((c) => c.codigo)).size).toBe(5);
  });
});

describe("ofertaPromoVip", () => {
  const ultimoUso = "2026-10-10T15:00:00.000Z";
  const gastado = () => packDeCuatro().map((c, i) => usar(c, i === 3 ? ultimoUso : `2026-10-0${i + 2}T15:00:00.000Z`));

  it("se abre al gastar el último ticket del pack de 4 y dura 48 h", () => {
    const o = ofertaPromoVip(gastado(), "AB1234", new Date("2026-10-11T15:00:00.000Z"));
    expect(o?.vence).toBe("2026-10-12T15:00:00.000Z");
    expect(ofertaPromoVip(gastado(), "AB1234", new Date("2026-10-12T15:00:01.000Z"))).toBeUndefined();
  });

  it("no se ofrece mientras le quede un ticket; si el resto venció sin usar, se abre 48 h desde el vencimiento", () => {
    const quedaUno = packDeCuatro().map((c, i) => (i < 3 ? usar(c, ultimoUso) : c));
    expect(ofertaPromoVip(quedaUno, "AB1234", new Date("2026-10-11T00:00:00.000Z"))).toBeUndefined();
    expect(ofertaPromoVip(quedaUno, "AB1234", new Date("2026-11-01T00:00:00.000Z"))?.vence).toBe("2026-11-02T12:00:00.000Z");
    expect(ofertaPromoVip(quedaUno, "AB1234", new Date("2026-11-03T00:00:00.000Z"))).toBeUndefined();
  });

  it("también se ofrece al terminar un pack de 2, pero no a otra patente", () => {
    const dos = cuponesPromoLavados({
      promo: "promo_2_lavados",
      patente: "AB1234",
      precio: 1,
      existentes: new Set(),
      creadoPor: "",
      idBase: "d",
      ahora: compra,
    }).map((c) => usar(c, ultimoUso));
    expect(ofertaPromoVip(dos, "AB1234", new Date("2026-10-11T00:00:00.000Z"))?.vence).toBe("2026-10-12T15:00:00.000Z");
    expect(ofertaPromoVip(gastado(), "CD5678", new Date("2026-10-11T00:00:00.000Z"))).toBeUndefined();
  });

  it("se apaga al comprar la VIP y se repite al gastar sus 4, aunque el libre siga sin usar", () => {
    const vip = cuponesPromoVip({ patente: "AB1234", precio: 19990, existentes: new Set(), creadoPor: "", idBase: "v", ahora: new Date("2026-10-12T15:00:00.000Z") });
    expect(ofertaPromoVip([...gastado(), ...vip], "AB1234", new Date("2026-10-13T00:00:00.000Z"))).toBeUndefined();
    const usados = vip.map((c, i) => (i < 4 ? usar(c, "2026-10-20T15:00:00.000Z") : c));
    expect(ofertaPromoVip([...gastado(), ...usados], "AB1234", new Date("2026-10-21T00:00:00.000Z"))).toBeDefined();
  });
});

describe("libresVipDePatente", () => {
  it("devuelve el libre vivo de la VIP que compró esa patente", () => {
    const vip = cuponesPromoVip({ patente: "AB1234", precio: 19990, existentes: new Set(), creadoPor: "", idBase: "v", ahora: compra });
    expect(libresVipDePatente(vip, "ab1234", new Date("2026-10-02T00:00:00.000Z")).map((c) => c.numeroLote)).toEqual([5]);
    expect(libresVipDePatente(vip, "CD5678", new Date("2026-10-02T00:00:00.000Z"))).toEqual([]);
  });
});

describe("ofertaPromoVip con invitación manual", () => {
  const viejo = () => packDeCuatro().map((c) => usar(c, "2026-10-05T15:00:00.000Z"));
  const ahora = new Date("2026-10-25T15:00:00.000Z");

  it("pasadas las 48 h, la invitación la vuelve a abrir hasta su fecha", () => {
    expect(ofertaPromoVip(viejo(), "AB1234", ahora)).toBeUndefined();
    expect(ofertaPromoVip(viejo(), "AB1234", ahora, "2026-10-30T15:00:00.000Z")).toEqual({ vence: "2026-10-30T15:00:00.000Z" });
    expect(ofertaPromoVip(viejo(), "AB1234", ahora, "2026-10-20T15:00:00.000Z")).toBeUndefined();
  });

  it("no aplica si todavía tiene tickets vivos", () => {
    const vivos = packDeCuatro();
    expect(ofertaPromoVip(vivos, "AB1234", new Date("2026-10-02T00:00:00.000Z"), "2026-10-30T15:00:00.000Z")).toBeUndefined();
  });
});

describe("Promo 2 Tickets 15 Días", () => {
  const dos = () =>
    cuponesPromoLavados({ promo: "promo_2_lavados", patente: "AB1234", precio: 1, existentes: new Set(), creadoPor: "", idBase: "d", ahora: compra });

  it("emite 2 tickets para la patente que vencen 15 días después de la compra", () => {
    const t = cuponesPromoRecompra2({ patente: "ab-1234", precio: 9990, existentes: new Set(), creadoPor: "Op", idBase: "r", ahora: compra });
    expect(t).toHaveLength(2);
    expect(t.map((c) => c.nombreLote)).toEqual([PROMO_RECOMPRA_2_KEY, PROMO_RECOMPRA_2_KEY]);
    expect(t.every((c) => c.patentesAutorizadas?.[0] === "AB1234")).toBe(true);
    expect(t[0].fechaCaducidad).toBe("2026-10-16T12:00:00.000Z");
    expect(t[0].valor).toBe(4995);
  });

  it("la ventana se abre al gastar el último de un pack de 2 o de 4 y se apaga al comprarla", () => {
    const gastadoDos = dos().map((c) => usar(c, "2026-10-10T15:00:00.000Z"));
    expect(ventanaRecompraPack(gastadoDos, "AB1234", new Date("2026-10-11T00:00:00.000Z"))).toBeDefined();
    expect(ventanaRecompraPack(packDeCuatro().map((c) => usar(c, "2026-10-10T15:00:00.000Z")), "AB1234", new Date("2026-10-11T00:00:00.000Z"))).toBeDefined();
    const recompra = cuponesPromoRecompra2({ patente: "AB1234", precio: 9990, existentes: new Set(), creadoPor: "", idBase: "r", ahora: new Date("2026-10-11T00:00:00.000Z") });
    expect(ventanaRecompraPack([...gastadoDos, ...recompra], "AB1234", new Date("2026-10-11T01:00:00.000Z"))).toBeUndefined();
    const gastadaRecompra = recompra.map((c) => usar(c, "2026-10-20T15:00:00.000Z"));
    expect(ventanaRecompraPack([...gastadoDos, ...gastadaRecompra], "AB1234", new Date("2026-10-21T00:00:00.000Z"))?.vence).toBe(
      "2026-10-22T15:00:00.000Z"
    );
  });

  it("si el pack de 2 venció con tickets sin usar, se abre 48 h desde el vencimiento", () => {
    const unoSinUsar = dos().map((c, i) => (i === 0 ? usar(c, "2026-10-05T15:00:00.000Z") : c));
    expect(ventanaRecompraPack(unoSinUsar, "AB1234", new Date("2026-10-20T00:00:00.000Z"))).toBeUndefined();
    expect(ventanaRecompraPack(unoSinUsar, "AB1234", new Date("2026-11-01T00:00:00.000Z"))?.vence).toBe("2026-11-02T12:00:00.000Z");
    expect(ventanaRecompraPack(dos(), "AB1234", new Date("2026-11-01T00:00:00.000Z"))?.vence).toBe("2026-11-02T12:00:00.000Z");
    expect(ventanaRecompraPack(unoSinUsar, "AB1234", new Date("2026-11-02T12:00:01.000Z"))).toBeUndefined();
  });
});
