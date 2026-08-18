import { describe, expect, it } from "vitest";
import type { Cliente } from "@/types";
import { filtrarYOrdenarClientes } from "./filtrarOrdenarClientes";

// El orden se calcula ahora con decorate-sort-undecorate (una clave por
// cliente en vez de recalcularla en cada comparación). Estos casos fijan el
// orden observable para que esa reescritura no lo haya movido.

function cliente(p: Partial<Cliente> & { id: string }): Cliente {
  return {
    nombre: "Sin nombre",
    patente: "AAAA11",
    origen: "LOCAL",
    visitas: 0,
    ...p,
  } as Cliente;
}

const enDias = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString();

describe("filtrarYOrdenarClientes", () => {
  const base = { search: "", filtroEstado: "todos", orden: "estado" };

  it("ordena por estado: vencido, por vencer, sin plan, vigente", () => {
    const clientes = [
      cliente({ id: "vigente", vencimiento: enDias(20) }),
      cliente({ id: "sinPlan" }),
      cliente({ id: "vencido", vencimiento: enDias(-5) }),
      cliente({ id: "porVencer", vencimiento: enDias(1) }),
    ];
    expect(filtrarYOrdenarClientes(clientes, base).map((c) => c.id)).toEqual([
      "vencido",
      "porVencer",
      "sinPlan",
      "vigente",
    ]);
  });

  it("deja los clientes sin vencimiento al final en ambas direcciones", () => {
    const clientes = [
      cliente({ id: "sinPlanA" }),
      cliente({ id: "lejos", vencimiento: enDias(30) }),
      cliente({ id: "sinPlanB" }),
      cliente({ id: "cerca", vencimiento: enDias(2) }),
    ];
    const asc = filtrarYOrdenarClientes(clientes, { ...base, orden: "vencimiento_asc" }).map((c) => c.id);
    const desc = filtrarYOrdenarClientes(clientes, { ...base, orden: "vencimiento_desc" }).map((c) => c.id);
    expect(asc.slice(0, 2)).toEqual(["cerca", "lejos"]);
    expect(desc.slice(0, 2)).toEqual(["lejos", "cerca"]);
    // Sin clave dedicada para el vacío, ±Infinity - ±Infinity daba NaN y estas
    // dos filas quedaban en cualquier parte.
    expect(asc.slice(2).sort()).toEqual(["sinPlanA", "sinPlanB"]);
    expect(desc.slice(2).sort()).toEqual(["sinPlanA", "sinPlanB"]);
  });

  it("prioriza la coincidencia exacta de patente sobre la parcial y sobre el nombre", () => {
    const clientes = [
      cliente({ id: "porNombre", nombre: "AB1234 Transportes", patente: "ZZZZ99" }),
      cliente({ id: "contiene", patente: "XXAB12" }),
      cliente({ id: "exacta", patente: "AB1234" }),
      cliente({ id: "empieza", patente: "AB1299" }),
    ];
    expect(filtrarYOrdenarClientes(clientes, { ...base, search: "AB1234" }).map((c) => c.id)).toEqual([
      "exacta",
      "porNombre",
    ]);
    // "AB12" es prefijo tanto de AB1234 como de AB1299: empatan en relevancia y
    // el desempate cae en la clave de columna (mismo estado "Sin plan"), así
    // que conservan el orden de entrada.
    expect(filtrarYOrdenarClientes(clientes, { ...base, search: "AB12" }).map((c) => c.id)).toEqual([
      "exacta",
      "empieza",
      "contiene",
      "porNombre",
    ]);
  });

  it("combina los filtros de estado, origen y rango de pasadas", () => {
    const clientes = [
      cliente({ id: "web", origen: "WEB", visitas: 5, vencimiento: enDias(10) }),
      cliente({ id: "local", origen: "LOCAL", visitas: 5, vencimiento: enDias(10) }),
      cliente({ id: "webPocasVisitas", origen: "WEB", visitas: 1, vencimiento: enDias(10) }),
      cliente({ id: "webVencido", origen: "WEB", visitas: 5, vencimiento: enDias(-1) }),
    ];
    const r = filtrarYOrdenarClientes(clientes, {
      ...base,
      filtroEstado: "Vigente",
      filtroOrigen: "WEB",
      pasadasDesde: "3",
      pasadasHasta: "10",
    });
    expect(r.map((c) => c.id)).toEqual(["web"]);
  });
});
