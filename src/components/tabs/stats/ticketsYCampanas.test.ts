import { describe, expect, it } from "vitest";
import type { Cupon } from "@/types";
import { ticketsYCampanas } from "./ticketsYCampanas";

let n = 0;
const cupon = (p: Partial<Cupon>): Cupon => ({
  id: String(++n),
  codigo: `C${n}`,
  nombreLote: "Lote",
  valor: 0,
  numeroLote: 1,
  totalLote: 1,
  fechaCaducidad: "2026-12-31T00:00:00Z",
  usado: false,
  creadoEn: "2026-10-10T12:00:00Z",
  tipo: "descuento",
  ...p,
});
const lote = (cantidad: number, p: Partial<Cupon>) => Array.from({ length: cantidad }, () => cupon(p));

describe("ticketsYCampanas", () => {
  const ahora = new Date("2026-10-21T12:00:00Z");

  it("cuenta tickets emitidos y canjeados en el período y los vivos de hoy", () => {
    const cs = [
      cupon({ tipo: "vale" }),
      cupon({ tipo: "vale", usado: true, fechaUso: "2026-10-15T12:00:00Z" }),
      cupon({ tipo: "vale", creadoEn: "2026-09-10T12:00:00Z", usado: true, fechaUso: "2026-09-12T12:00:00Z" }),
      cupon({ tipo: "vale", fechaCaducidad: "2026-10-20T00:00:00Z" }),
    ];
    const { tickets } = ticketsYCampanas(cs, "2026-10-01", "2026-10-21", ahora);
    expect(tickets).toEqual({ emitidos: 3, canjeados: 1, vivos: 1 });
  });

  it("una campaña es un lote masivo de descuentos no automático, con canjes a la fecha", () => {
    const cs = [
      ...lote(25, { nombreLote: "SMS masivo - x", creadoPor: "campana-x" }),
      cupon({ nombreLote: "SMS masivo - x", creadoPor: "campana-x", usado: true, fechaUso: "2026-11-02T00:00:00Z" }),
      ...lote(30, { nombreLote: "Web - Primera vez", creadoPor: "landing-web" }),
      ...lote(5, { nombreLote: "Cortesía", creadoPor: "Administrador" }),
      ...lote(20, { nombreLote: "Vieja", creadoPor: "Administrador", creadoEn: "2026-08-01T00:00:00Z" }),
    ];
    const { campanas } = ticketsYCampanas(cs, "2026-10-01", "2026-10-21", ahora);
    expect(campanas).toEqual([{ nombre: "SMS masivo - x", fecha: "2026-10-10T12:00:00Z", enviados: 26, canjeados: 1 }]);
  });

  it("un código de uso por patente suma un canje por cada patente", () => {
    const cs = lote(20, { nombreLote: "Abierta", unUsoPorPatente: true, patentesUsadas: ["AA11", "BB22"] });
    const { campanas } = ticketsYCampanas(cs, "2026-10-01", "2026-10-21", ahora);
    expect(campanas[0].canjeados).toBe(40);
  });
});
