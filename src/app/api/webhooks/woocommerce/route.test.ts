import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verificarFirma } from "./route";
import { fechaPagoPedido } from "./shared";

describe("fechaPagoPedido (webhook WooCommerce)", () => {
  it("usa la fecha de pago y no la de creación (RLVH74: creado 15-oct, pagado 22-oct)", () => {
    const order = { date_created: "2026-10-15T10:28:40", date_paid: "2026-10-22T17:55:31", date_paid_gmt: "2026-10-22T17:55:31" };
    expect(fechaPagoPedido(order)).toBe("2026-10-22T17:55:31.000Z");
  });

  it("lee date_paid_gmt como UTC aunque venga sin zona", () => {
    expect(fechaPagoPedido({ date_paid_gmt: "2026-10-22T17:55:31", date_paid: "2026-10-22T14:55:31" })).toBe("2026-10-22T17:55:31.000Z");
  });

  it("sin fecha de pago cae a la de creación, y sin ninguna a ahora", () => {
    expect(fechaPagoPedido({ date_created: "2026-10-15T10:28:40Z" })).toBe("2026-10-15T10:28:40.000Z");
    const ahora = new Date("2026-11-18T12:00:00Z");
    expect(fechaPagoPedido({ date_paid: null, date_created: "" }, ahora)).toBe(ahora.toISOString());
  });
});

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
