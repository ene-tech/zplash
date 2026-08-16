import { describe, expect, it, vi } from "vitest";

// La copia en la bandeja de salida no se ejercita acá (toca la base): lo que
// se fija en este archivo es la clasificación del error del proveedor, de la
// que cuelga el borrado del email del cliente en ejecutarAccionReglaCorreo.
vi.mock("@/lib/dataAccess/mail", () => ({ registrarCorreoAutomatico: vi.fn() }));

import { esRechazoDeDireccion } from "./proveedor";

const DESTINATARIO = "cliente@gmail.com";

describe("esRechazoDeDireccion", () => {
  it("mensaje del campo `to` -> rechazo permanente de la dirección", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "Invalid `to` field. The email address needs to follow the `email@example.com` format." },
        DESTINATARIO
      )
    ).toBe(true);
  });

  it("mensaje que nombra la dirección misma -> rechazo permanente", () => {
    expect(esRechazoDeDireccion({ message: `The email address ${DESTINATARIO} does not exist` }, DESTINATARIO)).toBe(true);
  });

  // El caso que motivó el test: el error del `from` trae "invalid" y un "to"
  // suelto en la prosa ("needs to follow"). Tomarlo por un rechazo del
  // destinatario le borraría el email a TODOS los clientes de la campaña,
  // porque un MAIL_FROM_ADDRESS mal configurado hace fallar cada envío.
  it("mensaje del campo `from` -> NO es rechazo de la dirección del destinatario", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "Invalid `from` field. The email address needs to follow the `email@example.com` format." },
        DESTINATARIO
      )
    ).toBe(false);
  });

  it("dominio del remitente sin verificar -> no borra nada", () => {
    expect(
      esRechazoDeDireccion(
        { name: "validation_error", message: "The zplash.cl domain is not verified. Please, add and verify your domain on https://resend.com/domains" },
        DESTINATARIO
      )
    ).toBe(false);
  });

  it("fallas transitorias del proveedor -> no borran nada", () => {
    expect(esRechazoDeDireccion({ name: "rate_limit_exceeded", message: "Too many requests" }, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "application_error", message: "Internal server error" }, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "missing_api_key", message: "Missing API key in the authorization header" }, DESTINATARIO)).toBe(false);
  });

  it("error sin mensaje legible -> sin evidencia, no borra nada", () => {
    expect(esRechazoDeDireccion({}, DESTINATARIO)).toBe(false);
    expect(esRechazoDeDireccion({ name: "validation_error", message: "" }, DESTINATARIO)).toBe(false);
  });
});
