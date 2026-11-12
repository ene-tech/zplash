import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: () => ({}) }));

import { segmentosSms, normalizarSms, MAX_SEGMENTOS_SMS } from "@/lib/sms/texto";
import { armarComprobanteReembolso, htmlComprobanteReembolso, motivoDeNotasReembolso, smsComprobanteReembolso } from "./comprobanteReembolso";

// Lo que se fija acá: el comprobante sale de lo que quedó escrito en el
// contra-asiento (así correo, SMS y ficha muestran lo mismo) y el SMS entra en
// el tope de segmentos aun con la compra y la tarjeta más largas.

const reembolso = {
  id: "reembolso-v1",
  fecha: "2026-11-04T15:30:00.000Z",
  nombre: "Juan <b>",
  patente: "AB1234",
  precio: -5000,
  voucher: "123456",
  notas: 'Reembolso parcial de "Renovación (Web)" del 2026-09-01 — cobro (doble) (por Gerencia) — vigencia anulada (vencimiento 2026-10-15 → 2026-09-15)',
};
const compra = { tipo: "Renovación (Web)", fecha: "2026-09-01T12:00:00.000Z" };

describe("comprobante de reembolso", () => {
  it("saca el motivo de las notas, con o sin vigencia anulada", () => {
    expect(motivoDeNotasReembolso(reembolso.notas)).toBe("cobro (doble)");
    expect(motivoDeNotasReembolso('Reembolso de "Lavado único" del 2026-09-01 — arrepentido (por Ana)')).toBe("arrepentido");
    expect(motivoDeNotasReembolso("Reversa de algo")).toBeUndefined();
  });

  it("arma monto, parcial, operación y código desde el contra-asiento", () => {
    const c = armarComprobanteReembolso(reembolso, compra, { medio: "Webpay", ordenCompra: "bo1", cobrado: 21990 });
    expect(c).toEqual(expect.objectContaining({ monto: 5000, parcial: true, operacion: "Anulación", codigoAutorizacion: "123456", ordenCompra: "bo1" }));
    const reversa = armarComprobanteReembolso({ ...reembolso, precio: -21990, voucher: "REVERSED" }, compra, { medio: "Webpay", ordenCompra: "bo1", cobrado: 21990 });
    expect(reversa).toEqual(expect.objectContaining({ parcial: false, operacion: "Reversa", codigoAutorizacion: undefined }));
  });

  it("el HTML escapa el texto libre y muestra la hora de Chile", () => {
    const html = htmlComprobanteReembolso(armarComprobanteReembolso(reembolso, compra, { medio: "Webpay", ordenCompra: "bo1", cobrado: 21990 }));
    expect(html).not.toContain("Juan <b>");
    expect(html).toContain("12:30");
    expect(html).toContain("cobro (doble)");
  });

  it("el SMS va en una línea y cabe en el tope de segmentos", () => {
    const c = armarComprobanteReembolso(
      { ...reembolso, voucher: "1234567890" },
      { tipo: "Promo 5 Tickets VIP (Web) con nombre largo", fecha: compra.fecha },
      { medio: "Oneclick", ordenCompra: "oc-1730000000000-ABCDEFGH", cobrado: 21990, tarjeta: "MasterCard **** 1234" }
    );
    const sms = smsComprobanteReembolso(c);
    expect(sms).not.toContain("\n");
    expect(segmentosSms(normalizarSms(sms))).toBeLessThanOrEqual(MAX_SEGMENTOS_SMS);
  });
});
