import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verificarFirma } from "./route";

const SECRETO = "secreto-de-prueba";

function firmar(body: string, secreto = SECRETO): string {
  return crypto.createHmac("sha256", secreto).update(body, "utf8").digest("base64");
}

describe("verificarFirma (webhook WooCommerce)", () => {
  it("acepta una firma calculada correctamente para el body", () => {
    const body = '{"id":123,"status":"processing"}';
    expect(verificarFirma(body, firmar(body), SECRETO)).toBe(true);
  });

  it("rechaza una firma calculada con otro secreto", () => {
    const body = '{"id":123,"status":"processing"}';
    expect(verificarFirma(body, firmar(body, "otro-secreto"), SECRETO)).toBe(false);
  });

  it("rechaza una firma para un body distinto", () => {
    const body = '{"id":123,"status":"processing"}';
    const otroBody = '{"id":123,"status":"cancelled"}';
    expect(verificarFirma(body, firmar(otroBody), SECRETO)).toBe(false);
  });

  it("rechaza cuando no viene header de firma", () => {
    expect(verificarFirma('{"id":123}', null, SECRETO)).toBe(false);
  });

  it("rechaza una firma de largo distinto sin reventar", () => {
    expect(verificarFirma('{"id":123}', "corta", SECRETO)).toBe(false);
  });
});
