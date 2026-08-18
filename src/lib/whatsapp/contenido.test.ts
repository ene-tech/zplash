import { describe, expect, it } from "vitest";
import type { PreciosPublicos } from "@/components/cliente/types";
import { parsearTamano, textoPedirTamano, textoPrecios } from "./contenido";

const PRECIOS: PreciosPublicos = {
  plan: { nombre: "Plan", precio: 23990 },
  planPrimera: { nombre: "Plan", precio: 21990 },
  planOneclick: { nombre: "Plan", precio: 20990 },
  lavadoUnico: { nombre: "Lavado único", precio: 9990 },
  zonaAspirado: { nombre: "Zona aspirado", precio: 4990 },
  servicios: [
    {
      id: "lavado-completo",
      nombre: "Lavado Completo Detailing",
      categoria: "Lavado Completo Detailing",
      precio: 45000,
      preciosTamano: { s: 40000, m: 45000, l: 55000, xl: 65000 },
    },
    { id: "tapiz", nombre: "Lavado de Tapiz", categoria: "Adicionales", precio: 30000 },
  ],
  tickets: { cantidadMinima: 10, cantidadMaxima: 100, precioBase: 79990, precioUnitario: 7999, vigenciaDias: 45 },
  descuentoBienvenida: { valor: 1000, diasValidez: 7 },
};

describe("parsearTamano", () => {
  it("acepta la letra y el número de la lista", () => {
    expect(parsearTamano("m")).toBe("m");
    expect(parsearTamano(" XL ")).toBe("xl");
    expect(parsearTamano("1")).toBe("s");
    expect(parsearTamano("4")).toBe("xl");
  });

  it("devuelve null para cualquier otra cosa, para poder repreguntar", () => {
    expect(parsearTamano("")).toBeNull();
    expect(parsearTamano("0")).toBeNull();
    expect(parsearTamano("5")).toBeNull();
    expect(parsearTamano("grande")).toBeNull();
    expect(parsearTamano("2.5")).toBeNull();
  });
});

describe("textoPedirTamano", () => {
  it("ofrece los 4 tamaños numerados, con su descripción", () => {
    const t = textoPedirTamano("¿De qué tamaño es tu auto?");
    expect(t).toContain("¿De qué tamaño es tu auto?");
    expect(t).toContain("*1* · S —");
    expect(t).toContain("*4* · XL —");
    // Cada número que se ofrece tiene que ser parseable de vuelta.
    for (const n of ["1", "2", "3", "4"]) expect(parsearTamano(n)).not.toBeNull();
  });
});

describe("textoPrecios", () => {
  it("cotiza el servicio según el tamaño elegido", () => {
    expect(textoPrecios(PRECIOS, "s", "*Precios*")).toContain("Lavado Completo Detailing: $40.000");
    expect(textoPrecios(PRECIOS, "xl", "*Precios*")).toContain("Lavado Completo Detailing: $65.000");
  });

  it("usa el precio plano para los servicios sin precio por tamaño", () => {
    for (const t of ["s", "xl"] as const) {
      expect(textoPrecios(PRECIOS, t, "*Precios*")).toContain("Lavado de Tapiz: $30.000");
    }
  });

  it("entrega los mismos valores que muestra la web, no constantes compiladas", () => {
    const t = textoPrecios(PRECIOS, "m", "*Precios*");
    expect(t).toContain("$9.990"); // lavadoUnico
    expect(t).toContain("$21.990"); // planPrimera, el precio que la landing muestra grande
    expect(t).toContain("(normal $23.990)"); // plan.precio, solo porque es mayor
    expect(t).toContain("$4.990"); // zonaAspirado
    expect(t).toContain("$79.990"); // pack de tickets
    expect(t).toContain("válido 45 días");
  });

  it("omite el precio normal del plan cuando no hay rebaja de 1ra contratación", () => {
    const sinRebaja = { ...PRECIOS, plan: { nombre: "Plan", precio: 21990 } };
    expect(textoPrecios(sinRebaja, "m", "*Precios*")).not.toContain("normal");
  });

  it("pone Lavado Completo Detailing antes que las demás categorías", () => {
    const t = textoPrecios(PRECIOS, "m", "*Precios*");
    expect(t.indexOf("*Lavado Completo Detailing*")).toBeLessThan(t.indexOf("*Adicionales*"));
  });
});
