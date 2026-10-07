import { describe, expect, it } from "vitest";
import { normalizarSms, segmentosSms, textoFinalSms } from "./texto";

describe("normalizarSms", () => {
  it("saca tildes que GSM-7 no tiene pero deja ñ y é", () => {
    expect(normalizarSms("Hola Andrés, ¿cómo está tu camión? Señor")).toBe("Hola Andrés, ¿como esta tu camion? Señor");
  });

  it("borra emojis sin dejar espacios dobles", () => {
    expect(normalizarSms("Hola 👋 Juan 🚿")).toBe("Hola Juan");
  });

  it("deja montos en pesos", () => {
    expect(normalizarSms("Paga solo $2.000")).toBe("Paga solo $2.000");
  });
});

describe("segmentosSms", () => {
  it("160 caracteres son un SMS, 161 son dos", () => {
    expect(segmentosSms("a".repeat(160))).toBe(1);
    expect(segmentosSms("a".repeat(161))).toBe(2);
    expect(segmentosSms("a".repeat(306))).toBe(2);
    expect(segmentosSms("a".repeat(307))).toBe(3);
  });

  it("los caracteres extendidos ocupan doble", () => {
    expect(segmentosSms("€".repeat(80))).toBe(1);
    expect(segmentosSms("€".repeat(81))).toBe(2);
  });
});

describe("textoFinalSms", () => {
  it("agrega el link de baja al final", () => {
    expect(textoFinalSms("Hola Juan 👋", "AB12CD")).toBe("Hola Juan. Baja: zplash.cl/b/AB12CD");
  });

  it("no duplica la puntuación final", () => {
    expect(textoFinalSms("¡Te esperamos!", "AB12CD")).toBe("¡Te esperamos! Baja: zplash.cl/b/AB12CD");
  });

  it("junta los saltos de línea en una sola línea (no llegan al teléfono)", () => {
    expect(textoFinalSms("Hola Juan\n\nTe esperamos", "AB12CD")).toBe("Hola Juan Te esperamos. Baja: zplash.cl/b/AB12CD");
  });
});
