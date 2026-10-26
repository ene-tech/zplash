import { describe, expect, it } from "vitest";
import { esErrorSmsDeCuenta, fallasContacto, puedeCorregirContacto } from "./contacto";

const bien = { nombre: "ANA PÉREZ", telefono: "+56912345678", email: "ana@ejemplo.cl" };

describe("fallasContacto", () => {
  it("una ficha completa y sin envíos fallidos no pide nada", () => {
    expect(fallasContacto(bien)).toEqual({});
  });

  it("el nombre Invitado del mesón cuenta como sin nombre", () => {
    expect(fallasContacto({ ...bien, nombre: "Invitado" }).nombre).toBeTruthy();
    expect(fallasContacto({ ...bien, nombre: "INVITADO " }).nombre).toBeTruthy();
  });

  it("pide el dato que falló aunque tenga valor", () => {
    expect(fallasContacto(bien, { smsFallido: true }).telefono).toBe("El último SMS no le llegó");
    expect(fallasContacto(bien, { correoSuprimido: true }).email).toBe("El correo rebotó");
    expect(fallasContacto(bien, { correoFallido: true }).email).toBe("El último correo no salió");
  });

  it("vacío o mal formado gana sobre el historial", () => {
    expect(fallasContacto({ ...bien, telefono: "+569" }, { smsFallido: true }).telefono).toBe("No tiene un celular válido");
    expect(fallasContacto({ ...bien, email: "" }).email).toBe("No tiene correo");
  });
});

describe("esErrorSmsDeCuenta", () => {
  it("sin saldo o sin red no es culpa del número", () => {
    expect(esErrorSmsDeCuenta("35: The account has no enough credit for this sending")).toBe(true);
    expect(esErrorSmsDeCuenta("Error de red")).toBe(true);
    expect(esErrorSmsDeCuenta("21: Invalid recipient")).toBe(false);
  });
});

describe("puedeCorregirContacto", () => {
  it("Jeny, Administración, Gerencia y quien tenga Clientes; el resto no", () => {
    expect(puedeCorregirContacto(["operador"], "Jeny")).toBe(true);
    expect(puedeCorregirContacto(["operador"], "Gerencia")).toBe(true);
    expect(puedeCorregirContacto(["operador", "clientes"], "Otro")).toBe(true);
    expect(puedeCorregirContacto(["operador"], "Hugo")).toBe(false);
  });
});
