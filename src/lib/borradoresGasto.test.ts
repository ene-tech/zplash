import { beforeEach, describe, expect, it } from "vitest";
import { eliminarBorradorGasto, guardarBorradorGasto, leerBorradoresGasto, type BorradorGasto } from "./borradoresGasto";

// El módulo lee `window.localStorage` y el entorno de vitest es "node", donde
// no existe ninguno de los dos: se stubea lo mínimo que usa.
const store: Record<string, string> = {};
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  },
});

const borrador = (id: string, descripcion: string): BorradorGasto => ({
  id,
  guardadoEn: "2026-08-20T12:00:00.000Z",
  fecha: "2026-08-20",
  descripcion,
  categoriaGasto: "",
  contraparte: "",
  rutProveedor: "",
  numeroFactura: "",
  tipoDocumento: null,
  montoTexto: "",
  estado: "pagado_cc",
  notas: "",
});

describe("borradores de gasto", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it("guarda varios borradores y los devuelve", () => {
    guardarBorradorGasto(borrador("bg1", "Arriendo"));
    const lista = guardarBorradorGasto(borrador("bg2", "Luz"));
    expect(lista.map((b) => b.descripcion)).toEqual(["Luz", "Arriendo"]);
    expect(leerBorradoresGasto()).toHaveLength(2);
  });

  it("volver a guardar el mismo borrador lo actualiza, no lo duplica", () => {
    guardarBorradorGasto(borrador("bg1", "Arriendo"));
    const lista = guardarBorradorGasto(borrador("bg1", "Arriendo enero"));
    expect(lista).toHaveLength(1);
    expect(lista[0].descripcion).toBe("Arriendo enero");
  });

  it("elimina solo el borrador pedido (al registrarlo o descartarlo)", () => {
    guardarBorradorGasto(borrador("bg1", "Arriendo"));
    guardarBorradorGasto(borrador("bg2", "Luz"));
    expect(eliminarBorradorGasto("bg1").map((b) => b.id)).toEqual(["bg2"]);
  });

  it("no revienta si el localStorage trae basura", () => {
    store["zplash_borradores_gasto"] = "{no es json";
    expect(leerBorradoresGasto()).toEqual([]);
  });
});
