import { describe, expect, it } from "vitest";
import { PROMO_VIP_KEY, cuponesPromoLavados, cuponesPromoVip, libresVipDePatente, ofertaPromoVip } from "@/lib/helpers";
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

  it("se abre al gastar el último ticket del pack de 4 y dura 120 h", () => {
    const o = ofertaPromoVip(gastado(), "AB1234", new Date("2026-10-12T15:00:00.000Z"));
    expect(o?.vence).toBe("2026-10-15T15:00:00.000Z");
    expect(ofertaPromoVip(gastado(), "AB1234", new Date("2026-10-15T15:00:01.000Z"))).toBeUndefined();
  });

  it("no se ofrece mientras le quede un ticket, ni si el resto del pack venció sin usar", () => {
    const quedaUno = packDeCuatro().map((c, i) => (i < 3 ? usar(c, ultimoUso) : c));
    expect(ofertaPromoVip(quedaUno, "AB1234", new Date("2026-10-11T00:00:00.000Z"))).toBeUndefined();
    expect(ofertaPromoVip(quedaUno, "AB1234", new Date("2026-11-02T00:00:00.000Z"))).toBeUndefined();
  });

  it("no se ofrece por un pack de 2 ni a otra patente", () => {
    const dos = cuponesPromoLavados({
      promo: "promo_2_lavados",
      patente: "AB1234",
      precio: 1,
      existentes: new Set(),
      creadoPor: "",
      idBase: "d",
      ahora: compra,
    }).map((c) => usar(c, ultimoUso));
    expect(ofertaPromoVip(dos, "AB1234", new Date("2026-10-11T00:00:00.000Z"))).toBeUndefined();
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
