import { describe, expect, it } from "vitest";
import { ticketsVencidosDeCliente } from "@/lib/helpers";
import type { Cupon } from "@/types";

const ticket = (extra: Partial<Cupon>): Cupon => ({
  id: "t1",
  codigo: "T1",
  nombreLote: "Promo 5 Tickets VIP",
  valor: 0,
  numeroLote: 1,
  totalLote: 5,
  fechaCaducidad: "2026-11-10T02:59:59.000Z",
  usado: false,
  creadoEn: "2026-10-01T00:00:00.000Z",
  tipo: "vale",
  patenteAsignada: "ABCD12",
  patentesAutorizadas: ["ABCD12"],
  ...extra,
});

const ahora = new Date("2026-11-18T12:00:00.000Z");
const cliente = { patente: "ABCD12", email: "", rut: "" };

describe("ticketsVencidosDeCliente", () => {
  it("agrupa los tickets de un pack que vencieron el mismo día", () => {
    const lista = [ticket({}), ticket({ id: "t2" }), ticket({ id: "t3", usado: true })];
    expect(ticketsVencidosDeCliente(lista, cliente, ahora)).toEqual([
      { fecha: "2026-11-10T02:59:59.000Z", lote: "Promo 5 Tickets VIP", cantidad: 2 },
    ]);
  });

  it("no cuenta los vigentes, los descuentos ni los de otra patente", () => {
    const lista = [
      ticket({ fechaCaducidad: "2026-12-01T02:59:59.000Z" }),
      ticket({ id: "d", tipo: "descuento", patentesAutorizadas: undefined }),
      ticket({ id: "o", patenteAsignada: "ZZZZ99", patentesAutorizadas: ["ZZZZ99"] }),
    ];
    expect(ticketsVencidosDeCliente(lista, cliente, ahora)).toEqual([]);
  });
});
