import { describe, expect, it } from "vitest";
import {
  CONFIG_DEFAULT,
  dentroDeHorarioOperador,
  esExentoBloqueoReingreso,
  esExentoFormatoCliente,
  esExentoHorarioOperador,
  esExentoValidacionRegistroOperador,
  esFinDeSemanaOFestivo,
  fmtCLP,
  formatRut,
  estadoReingresoPlan,
  fmtHora,
  fmtTelefono,
  formatTelefono,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  mensajeBloqueoReingreso,
  mesKey,
  montoDescuento,
  normPlate,
  ordenarPerfiles,
  planStatus,
  proximoIngresoPermitido,
  puedeBorrarCategoriaInventario,
  resolverDescuento,
  vencimientoAnclado,
} from "./helpers";
import type { ConfigGlobal, Cupon, Ingreso, PerfilPublico } from "@/types";

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

describe("fmtTelefono", () => {
  it("agrega el formato visual +569 -XXXX XXXX a un celular ya normalizado", () => {
    expect(fmtTelefono("+56912345678")).toBe("+569 -1234 5678");
  });

  it("normaliza antes de formatear, aceptando las mismas variantes que formatTelefono", () => {
    expect(fmtTelefono("912345678")).toBe("+569 -1234 5678");
    expect(fmtTelefono("+56 9 1234 5678")).toBe("+569 -1234 5678");
  });

  it("devuelve vacío/original si no hay teléfono o no calza con el patrón chileno", () => {
    expect(fmtTelefono("")).toBe("");
    expect(fmtTelefono(null)).toBe("");
    expect(fmtTelefono("221234567")).toBe("221234567");
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

describe("estadoReingresoPlan", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  const ahora = new Date("2026-01-02T10:00:00Z");

  it("libre si el cliente no tiene ingresos previos", () => {
    expect(estadoReingresoPlan([], "c1", ahora)).toBe("libre");
  });

  it("garantia si el último ingreso fue hace 1 hora o menos", () => {
    const haceMediaHora = new Date("2026-01-02T09:30:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", haceMediaHora)], "c1", ahora)).toBe("garantia");
  });

  it("bloqueado si el último ingreso fue hace más de 1 hora y menos de 24:30", () => {
    const haceVeinteHoras = new Date("2026-01-01T14:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", haceVeinteHoras)], "c1", ahora)).toBe("bloqueado");
  });

  it("libre si el último ingreso fue hace 24:30 horas o más", () => {
    const hace25Horas = new Date("2026-01-01T09:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", hace25Horas)], "c1", ahora)).toBe("libre");
  });

  it("ignora ingresos de otros clientes", () => {
    const haceUnaHora = new Date("2026-01-02T09:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("otro", haceUnaHora)], "c1", ahora)).toBe("libre");
  });
});

describe("proximoIngresoPermitido / mensajeBloqueoReingreso", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("undefined si el cliente no tiene ingresos previos", () => {
    expect(proximoIngresoPermitido([], "c1")).toBeUndefined();
  });

  it("es el último ingreso + 24:30 horas", () => {
    const ultimo = ingreso("c1", "2026-01-01T10:00:00Z");
    const proximo = proximoIngresoPermitido([ultimo], "c1");
    expect(proximo?.toISOString()).toBe("2026-01-02T10:30:00.000Z");
  });

  it("el mensaje incluye la hora a partir de la cual puede reingresar", () => {
    const ultimo = ingreso("c1", "2026-01-01T10:00:00-03:00");
    const msg = mensajeBloqueoReingreso([ultimo], "c1");
    expect(msg).toContain("VEHICULO HIZO USO DEL SERVICIO TUNEL HACE MENOS DE 24 HORAS");
    expect(msg).toContain(fmtHora("2026-01-02T10:30:00-03:00"));
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

describe("esFinDeSemanaOFestivo", () => {
  it("sábado y domingo cuentan como fin de semana", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-18T12:00:00"), [])).toBe(true); // sábado
    expect(esFinDeSemanaOFestivo(new Date("2026-07-19T12:00:00"), [])).toBe(true); // domingo
  });

  it("un día de semana en la lista de festivos también cuenta", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-17T12:00:00"), ["2026-07-17"])).toBe(true); // viernes festivo
  });

  it("un día de semana normal no es fin de semana ni festivo", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-17T12:00:00"), [])).toBe(false); // viernes
  });
});

describe("dentroDeHorarioOperador", () => {
  const config: ConfigGlobal = CONFIG_DEFAULT; // semana 08:25-20:15, finde 09:55-19:15

  it("dentro del horario de semana en un día hábil", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T12:00:00"))).toBe(true); // viernes
  });

  it("fuera del horario de semana (antes de abrir)", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T08:00:00"))).toBe(false);
  });

  it("fuera del horario de semana (después de cerrar)", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T20:30:00"))).toBe(false);
  });

  it("usa el horario de fin de semana un sábado", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-18T10:00:00"))).toBe(true);
    expect(dentroDeHorarioOperador(config, new Date("2026-07-18T08:00:00"))).toBe(false);
  });

  it("un festivo en día de semana usa el horario de fin de semana", () => {
    const configConFestivo: ConfigGlobal = { ...config, festivos: ["2026-07-17"] };
    expect(dentroDeHorarioOperador(configConFestivo, new Date("2026-07-17T08:30:00"))).toBe(false); // ya no aplica horario de semana
    expect(dentroDeHorarioOperador(configConFestivo, new Date("2026-07-17T10:00:00"))).toBe(true); // dentro del horario de finde
  });
});

describe("esExentoHorarioOperador", () => {
  it("un perfil con acceso a Configuración está exento", () => {
    expect(esExentoHorarioOperador(["operador", "config"])).toBe(true);
  });

  it("un perfil de Administración sin acceso a Configuración también está exento", () => {
    expect(esExentoHorarioOperador(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un operador estándar sin acceso a Configuración no está exento", () => {
    expect(esExentoHorarioOperador(["operador", "servicios"])).toBe(false);
  });
});

describe("esExentoFormatoCliente", () => {
  it("el perfil Gerencia está exento de la validación de formato", () => {
    expect(esExentoFormatoCliente("Gerencia")).toBe(true);
  });

  it("otros perfiles, incluido Administración, no están exentos", () => {
    expect(esExentoFormatoCliente("Administración")).toBe(false);
    expect(esExentoFormatoCliente(undefined)).toBe(false);
  });
});

describe("puedeBorrarCategoriaInventario", () => {
  it("el perfil Gerencia puede borrar categorías de inventario", () => {
    expect(puedeBorrarCategoriaInventario("Gerencia")).toBe(true);
  });

  it("otros perfiles, incluido Administración, no pueden", () => {
    expect(puedeBorrarCategoriaInventario("Administración")).toBe(false);
    expect(puedeBorrarCategoriaInventario(undefined)).toBe(false);
  });
});

describe("esExentoValidacionRegistroOperador", () => {
  it("Gerencia (con acceso a Configuración) está exenta de validar teléfono/email al registrar un ingreso", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "config"], "Gerencia")).toBe(true);
  });

  it("Administración está exenta aunque no tenga acceso a Configuración", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un operador estándar no está exento", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "servicios"], "Christian")).toBe(false);
  });
});

describe("esExentoBloqueoReingreso", () => {
  it("Gerencia (con acceso a Configuración) puede forzar el ingreso aunque el reingreso esté bloqueado", () => {
    expect(esExentoBloqueoReingreso(["operador", "config"], "Gerencia")).toBe(true);
  });

  it("Administración está exenta aunque no tenga acceso a Configuración", () => {
    expect(esExentoBloqueoReingreso(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un operador estándar no está exento", () => {
    expect(esExentoBloqueoReingreso(["operador", "servicios"], "Christian")).toBe(false);
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
