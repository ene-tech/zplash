import { describe, expect, it } from "vitest";
import type { Cliente, Empresa, Venta } from "@/types";
import { facturasDeEmpresa } from "./empresas";

const empresa = { id: "e", razonSocial: "Transportes X", rut: "76.123.456-K", creadoEn: "" } as Empresa;
const clientes = [{ id: "c1", rut: "76123456-k" }, { id: "c2", rut: "11.111.111-1" }] as Cliente[];
const venta = (id: string, extra: Partial<Venta>): Venta =>
  ({ id, clienteId: "c1", patente: "ABCD12", nombre: "", plan: "", precio: 1000, tipo: "Renovación", fecha: "2026-10-01T12:00:00Z", facturaEmitida: true, ...extra }) as Venta;

describe("facturasDeEmpresa", () => {
  it("agrupa por folio, deja sueltas las marcadas a mano y filtra por RUT de venta o de cliente", () => {
    const ventas = [
      venta("a", { facturaFolio: 10 }),
      venta("b", { facturaFolio: 10, fecha: "2026-10-05T12:00:00Z" }),
      venta("c", { fecha: "2026-09-01T12:00:00Z" }),
      venta("d", { clienteId: "", rut: "76123456-K", facturaFolio: 11, fecha: "2026-10-07T12:00:00Z" }),
      venta("e", { clienteId: "c2", facturaFolio: 12 }),
      venta("f", { facturaEmitida: false }),
    ];
    const r = facturasDeEmpresa(empresa, ventas, clientes);
    expect(r.map((f) => [f.folio, f.total, f.ventas.length])).toEqual([
      [11, 1000, 1],
      [10, 2000, 2],
      [undefined, 1000, 1],
    ]);
  });
});
