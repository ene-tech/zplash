import { describe, expect, it } from "vitest";
import { esTicketGestionable, loteIdDeTicket, MAX_PATENTES_REGLA, normalizarReglaPatentes } from "./ticketsGestion";
import { KEYS_PROMOS_LAVADOS } from "@/lib/helpers/precios";

const pack = { tipo: "vale" as const, creadoPor: "Automático (Webpay)", nombreLote: "Lavados flota", totalLote: 10 };

describe("esTicketGestionable", () => {
  it("acepta un ticket de Pack de Tickets comprado por la web", () => {
    expect(esTicketGestionable(pack)).toBe(true);
  });
  it("rechaza los packs de 2 y 5 lavados, que son de una patente", () => {
    for (const key of KEYS_PROMOS_LAVADOS) expect(esTicketGestionable({ ...pack, nombreLote: key })).toBe(false);
  });
  it("rechaza lotes del admin, descuentos y tickets sueltos", () => {
    expect(esTicketGestionable({ ...pack, creadoPor: "Gerencia" })).toBe(false);
    expect(esTicketGestionable({ ...pack, tipo: "descuento" })).toBe(false);
    expect(esTicketGestionable({ ...pack, totalLote: 1 })).toBe(false);
  });
});

describe("loteIdDeTicket", () => {
  it("saca el sufijo -i que agrega aplicarPagoPackEmpresa", () => {
    expect(loteIdDeTicket("item-abc-def-0")).toBe("item-abc-def");
    expect(loteIdDeTicket("item-abc-def-12")).toBe("item-abc-def");
  });
});

describe("normalizarReglaPatentes", () => {
  it("normaliza, saca duplicados y deja [] como abierto", () => {
    expect(normalizarReglaPatentes(["ab-1234", "AB1234", " cdkl45 "])).toEqual({ ok: true, patentes: ["AB1234", "CDKL45"] });
    expect(normalizarReglaPatentes([])).toEqual({ ok: true, patentes: [] });
  });
  it("rechaza patentes inválidas, tipos raros y listas enormes", () => {
    expect(normalizarReglaPatentes(["AB12"]).ok).toBe(false);
    expect(normalizarReglaPatentes("AB1234").ok).toBe(false);
    expect(normalizarReglaPatentes([1234]).ok).toBe(false);
    const muchas = Array.from({ length: MAX_PATENTES_REGLA + 1 }, (_, i) => `AB${String(i).padStart(4, "0")}`);
    expect(normalizarReglaPatentes(muchas).ok).toBe(false);
  });
});
