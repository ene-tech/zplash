import { describe, expect, it } from "vitest";
import {
  fmtCLP,
  formatRut,
  formatTelefono,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  mesKey,
  montoDescuento,
  normPlate,
  ordenarPerfiles,
  planStatus,
  resolverDescuento,
  vencimientoAnclado,
} from "./helpers";
import type { Cupon, PerfilPublico } from "@/types";

describe("normPlate", () => {
  it("pasa a mayúsculas y saca todo lo que no sea letra/número", () => {
    expect(normPlate("ab-1234")).toBe("AB1234");
    expect(normPlate(" ab.cd.12 ")).toBe("ABCD12");
  });

  it("devuelve string vacío para null/undefined", () => {
    expect(normPlate(null)).toBe("");
    expect(normPlate(undefined)).toBe("");
  });
});

describe("isValidPatente", () => {
  it("acepta formato antiguo (2 letras + 4 números)", () => {
    expect(isValidPatente("AB1234")).toBe(true);
  });

  it("acepta formato nuevo (4 letras + 2 números)", () => {
    expect(isValidPatente("ABCD12")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidPatente("ABC123")).toBe(false);
    expect(isValidPatente("")).toBe(false);
    expect(isValidPatente(null)).toBe(false);
  });
});

describe("formatRut / isValidRut", () => {
  it("agrega puntos de miles y separa el dígito verificador con guion", () => {
    expect(formatRut("123456789")).toBe("12.345.678-9");
  });

  it("acepta 'k' minúscula como dígito verificador y la normaliza a mayúscula", () => {
    expect(formatRut("12345678k")).toBe("12.345.678-K");
  });

  it("valida ruts bien formados y rechaza el resto", () => {
    expect(isValidRut("12.345.678-9")).toBe(true);
    expect(isValidRut("123456789")).toBe(true);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut(null)).toBe(false);
  });
});

describe("formatTelefono / isValidTelefono", () => {
  it("normaliza las variantes comunes de celular chileno a +569XXXXXXXX", () => {
    expect(formatTelefono("+56 9 1234 5678")).toBe("+56912345678");
    expect(formatTelefono("912345678")).toBe("+56912345678");
    expect(formatTelefono("12345678")).toBe("+56912345678");
  });

  it("descarta un 0 inicial antes de evaluar el patrón", () => {
    expect(formatTelefono("0912345678")).toBe("+56912345678");
  });

  it("devuelve el original si no calza con ningún patrón conocido", () => {
    expect(formatTelefono("221234567")).toBe("221234567");
  });

  it("el teléfono vacío es válido (es opcional) pero uno mal formado no", () => {
    expect(isValidTelefono("")).toBe(true);
    expect(isValidTelefono(null)).toBe(true);
    expect(isValidTelefono("221234567")).toBe(false);
    expect(isValidTelefono("+56912345678")).toBe(true);
  });
});

describe("planStatus", () => {
  it("sin vencimiento -> Sin plan", () => {
    expect(planStatus({ vencimiento: null }).label).toBe("Sin plan");
  });

  it("vencimiento pasado -> Vencido", () => {
    expect(planStatus({ vencimiento: "2000-01-01" }).label).toBe("Vencido");
  });

  it("vencimiento dentro de los próximos 7 días -> Por vencer", () => {
    const enTresDias = new Date();
    enTresDias.setDate(enTresDias.getDate() + 3);
    expect(planStatus({ vencimiento: enTresDias.toISOString() }).label).toBe("Por vencer");
  });

  it("vencimiento lejano -> Vigente", () => {
    const enUnMes = new Date();
    enUnMes.setDate(enUnMes.getDate() + 40);
    expect(planStatus({ vencimiento: enUnMes.toISOString() }).label).toBe("Vigente");
  });
});

describe("vencimientoAnclado", () => {
  it("mantiene el ciclo de 30 días anclado a la fecha de contratación original", () => {
    const contratacion = new Date();
    contratacion.setDate(contratacion.getDate() - 65); // 2 ciclos vencidos, dentro del 3ro
    const resultado = new Date(vencimientoAnclado(contratacion.toISOString()));
    const esperado = new Date(contratacion);
    esperado.setDate(esperado.getDate() + 90); // 3 ciclos de 30 días
    expect(resultado.toDateString()).toBe(esperado.toDateString());
  });

  it("sin fecha de contratación, usa hoy + 30 días", () => {
    const resultado = new Date(vencimientoAnclado(null));
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 30);
    expect(resultado.toDateString()).toBe(esperado.toDateString());
  });
});

describe("mesKey", () => {
  it("arma la clave YYYY-MM de una fecha ISO", () => {
    expect(mesKey("2026-03-05T12:00:00.000Z")).toBe("2026-03");
  });
});

describe("fmtCLP", () => {
  it("redondea y formatea con separador de miles chileno", () => {
    expect(fmtCLP(19990)).toBe("$19.990");
    expect(fmtCLP(1000.6)).toBe("$1.001");
  });
});

describe("resolverDescuento", () => {
  const cuponBase: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Lote de prueba",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    esPorcentaje: false,
    valor: 5000,
    usado: false,
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 86400000).toISOString(),
  };

  it("acepta un cupón válido y sin restricción de patente", () => {
    const r = resolverDescuento("abc123", "AB1234", [cuponBase]);
    expect(r.ok).toBe(true);
  });

  it("rechaza código inexistente", () => {
    const r = resolverDescuento("ZZZZZZ", "AB1234", [cuponBase]);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón ya usado", () => {
    const r = resolverDescuento("abc123", "AB1234", [{ ...cuponBase, usado: true }]);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón caducado", () => {
    const caducado = { ...cuponBase, fechaCaducidad: new Date(Date.now() - 86400000).toISOString() };
    const r = resolverDescuento("abc123", "AB1234", [caducado]);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón asignado a otra patente", () => {
    const asignado = { ...cuponBase, patenteAsignada: "ZZ9999" };
    const r = resolverDescuento("abc123", "AB1234", [asignado]);
    expect(r.ok).toBe(false);
  });
});

describe("montoDescuento", () => {
  const cuponBase: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Lote de prueba",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    usado: false,
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 86400000).toISOString(),
    valor: 5000,
  };

  it("calcula el monto fijo cuando el cupón no es porcentual", () => {
    expect(montoDescuento({ ...cuponBase, esPorcentaje: false, valor: 5000 }, 19990)).toBe(5000);
  });

  it("calcula el porcentaje sobre el precio base y redondea", () => {
    expect(montoDescuento({ ...cuponBase, esPorcentaje: true, valor: 10 }, 19990)).toBe(1999);
  });
});

describe("ordenarPerfiles", () => {
  it("deja Administración y Gerencia al final en ese orden, el resto alfabético", () => {
    const perfiles: PerfilPublico[] = [
      { id: "1", nombre: "Gerencia", modulos: [] },
      { id: "2", nombre: "Zoe", modulos: [] },
      { id: "3", nombre: "Administración", modulos: [] },
      { id: "4", nombre: "Ana", modulos: [] },
    ];
    expect(ordenarPerfiles(perfiles).map((p) => p.nombre)).toEqual(["Ana", "Zoe", "Administración", "Gerencia"]);
  });
});
