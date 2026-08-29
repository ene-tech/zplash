import { describe, expect, it } from "vitest";
import { sinClavesVacias } from "./shared";

// Lo que se fija acá es el tamaño del payload del login: los mapeadores
// `*FromRow` dejan los opcionales en `undefined`, y el serializador de React
// manda cada uno como "$undefined" (5,5 MB de los 12,4 MB medidos el
// 2026-08-28). Si alguien vuelve a devolver las filas sin pasar por acá, el
// login vuelve a pesar el doble sin que nada se rompa a la vista.
describe("sinClavesVacias", () => {
  it("borra las claves undefined de cada fila sin tocar el resto", () => {
    const data = sinClavesVacias({
      clientes: [{ id: "c1", nombre: "Ana", rut: undefined, visitas: 0, plan: null }],
      config: { id: "cfg", algo: undefined },
      total: 3,
    });

    expect(Object.keys(data.clientes[0])).toEqual(["id", "nombre", "visitas", "plan"]);
    // Leerla sigue dando undefined: para el resto del código no cambia nada.
    expect((data.clientes[0] as { rut?: string }).rut).toBeUndefined();
    // Valores falsy que NO son undefined se conservan.
    expect(data.clientes[0]).toMatchObject({ visitas: 0, plan: null });
    // Solo toca arreglos: los objetos sueltos y los escalares quedan igual.
    expect(data.config).toEqual({ id: "cfg", algo: undefined });
    expect(data.total).toBe(3);
  });

  it("aguanta arreglos de strings y filas nulas", () => {
    const data = sinClavesVacias({ ids: ["a", "b"], sueltas: [null, undefined] });
    expect(data.ids).toEqual(["a", "b"]);
    expect(data.sueltas).toEqual([null, undefined]);
  });
});
