import { describe, expect, it } from "vitest";
import { mismaPersona } from "./clientes";

// Guarda de la fusión automática por cambio de patente: una ficha ajena (ej. un
// "Cliente Web" comprado por otro) nunca debe absorber la de este cliente.
describe("mismaPersona", () => {
  it("calza por correo sin importar mayúsculas", () => {
    expect(mismaPersona({ email: "Luis@X.cl", telefono: null }, { email: "luis@x.cl ", telefono: null })).toBe(true);
  });
  it("calza por teléfono válido", () => {
    expect(mismaPersona({ email: null, telefono: "+56995293880" }, { email: "otro@x.cl", telefono: "+56995293880" })).toBe(true);
  });
  it("no calza con datos distintos, vacíos o el placeholder +569", () => {
    expect(mismaPersona({ email: "v@x.cl", telefono: "+56911112222" }, { email: "atacante@x.cl", telefono: null })).toBe(false);
    expect(mismaPersona({ email: null, telefono: null }, { email: null, telefono: null })).toBe(false);
    expect(mismaPersona({ email: "", telefono: "+569" }, { email: "", telefono: "+569" })).toBe(false);
  });
});
