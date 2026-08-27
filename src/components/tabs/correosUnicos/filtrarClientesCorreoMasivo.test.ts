import { describe, expect, it } from "vitest";
import { filtrarClientesCorreoMasivo, type FiltrosCorreoMasivo } from "./filtrarClientesCorreoMasivo";
import type { Cliente, Ingreso } from "@/types";

const SIN_FILTROS: FiltrosCorreoMasivo = {
  filtroEstado: "todos",
  filtroOrigen: "todos",
  vencidoDiasMax: "",
  pasadasMin: "",
  pasadasMax: "",
  filtroAutopago: "todos",
  busqueda: "",
};

const cliente = (id: string, vencimiento: string | null): Cliente => ({
  id,
  nombre: id,
  patente: `AB${id}`,
  email: `${id}@mail.cl`,
  creadoEn: "2026-01-01T00:00:00Z",
  vencimiento,
});

// Todos dentro del último período pagado (el mes que termina en vencimiento).
const ingresos = (clienteId: string, cantidad: number): Ingreso[] =>
  Array.from({ length: cantidad }, (_, n) => ({
    id: `${clienteId}-${n}`,
    clienteId,
    patente: `AB${clienteId}`,
    nombre: clienteId,
    fecha: `2026-06-${String(10 + n).padStart(2, "0")}T09:00:00Z`,
    planEstadoAlIngreso: "ok" as const,
  }));

describe("filtrarClientesCorreoMasivo — rango de pasadas", () => {
  const bajoUso = cliente("c1", "2026-07-01T00:00:00Z"); // 3 pasadas
  const altoUso = cliente("c2", "2026-07-01T00:00:00Z"); // 7 pasadas
  const sinPlan = cliente("c3", null);
  const clientes = [bajoUso, altoUso, sinPlan];
  const historial = [...ingresos("c1", 3), ...ingresos("c2", 7)];

  it("0 a 5 deja al de bajo uso y saca al que pasaba más", () => {
    const r = filtrarClientesCorreoMasivo(clientes, { ...SIN_FILTROS, pasadasMin: "0", pasadasMax: "5" }, null, historial);
    expect(r.map((c) => c.id)).toEqual(["c1"]);
  });

  it("sin vencimiento queda fuera aunque el rango empiece en 0", () => {
    const r = filtrarClientesCorreoMasivo([sinPlan], { ...SIN_FILTROS, pasadasMax: "5" }, null, historial);
    expect(r).toEqual([]);
  });

  it("sin historial cargado no devuelve a nadie en vez de contarlos todos como 0", () => {
    const r = filtrarClientesCorreoMasivo(clientes, { ...SIN_FILTROS, pasadasMax: "5" }, null, undefined);
    expect(r).toEqual([]);
  });

  it("sin rango, el historial no hace falta", () => {
    expect(filtrarClientesCorreoMasivo(clientes, SIN_FILTROS, null, undefined)).toHaveLength(3);
  });
});
