import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/buzon/enviar", () => ({ enviarCorreo: vi.fn() }));
vi.mock("./graph", () => ({ enviarDmInstagram: vi.fn(), perfilInstagram: vi.fn() }));

const { datosQueFaltan, pideDescuentoInstagram } = await import("./cuponSeguidor");

describe("datosQueFaltan", () => {
  it("sin ficha pide todo", () => {
    expect(datosQueFaltan(null)).toEqual({ nombre: true, telefono: true, email: true });
  });

  it("ficha con datos buenos no pide nada", () => {
    expect(datosQueFaltan({ nombre: "Ana", telefono: "+56912345678", email: "ana@gmail.com" })).toEqual({
      nombre: false,
      telefono: false,
      email: false,
    });
  });

  it("pide el celular que falta o es inválido, y el correo de relleno", () => {
    expect(datosQueFaltan({ nombre: "Ana", telefono: "+569", email: "noquierodar@gmail.com" })).toEqual({
      nombre: false,
      telefono: true,
      email: true,
    });
    expect(datosQueFaltan({ nombre: "Ana", telefono: "", email: "ana@gmail" }).email).toBe(true);
  });

  it("el nombre genérico de la web cuenta como faltante", () => {
    expect(datosQueFaltan({ nombre: "Cliente Web", telefono: "+56912345678", email: "ana@gmail.com" }).nombre).toBe(true);
  });
});

describe("pideDescuentoInstagram", () => {
  it("reconoce ZPLASH solo, con signos o emojis", () => {
    expect(pideDescuentoInstagram("ZPLASH")).toBe(true);
    expect(pideDescuentoInstagram(" zplash! 🙌")).toBe(true);
    expect(pideDescuentoInstagram("¿a qué hora abren?")).toBe(false);
    expect(pideDescuentoInstagram(undefined)).toBe(false);
  });

  it("no confunde una pregunta que nombra la marca o la web", () => {
    expect(pideDescuentoInstagram("Hola zplash, ¿abren el domingo?")).toBe(false);
    expect(pideDescuentoInstagram("zplash.cl/pagar no carga")).toBe(false);
  });
});
