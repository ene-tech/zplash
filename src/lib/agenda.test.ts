import { describe, expect, it } from "vitest";
import { diaSemanaDe, esRetrocesoInvalido, puedeIngresarTunelDetailing, seSuperponen, validarDisponibilidad } from "./agenda";
import type { BloqueoAgenda, Cita, HorarioAgenda } from "@/types";

function horario(diaSemana: number, horaInicio: string, horaFin: string): HorarioAgenda {
  return { id: "h" + diaSemana + horaInicio, diaSemana, horaInicio, horaFin };
}

function cita(overrides: Partial<Cita> = {}): Cita {
  return {
    id: "c1",
    servicioIds: [],
    patente: "AB1234",
    nombre: "JUAN",
    fechaHora: "2026-07-14T10:00:00",
    duracionMinutos: 30,
    estado: "agendado",
    origen: "interno",
    creadoEn: "2026-07-14T09:00:00",
    ...overrides,
  };
}

describe("diaSemanaDe", () => {
  it("calcula el día de semana sin desfase de timezone", () => {
    // 2026-07-14 es martes.
    expect(diaSemanaDe("2026-07-14")).toBe(2);
  });
});

describe("seSuperponen", () => {
  it("detecta rangos que se cruzan", () => {
    expect(seSuperponen(60, 90, 80, 100)).toBe(true);
  });

  it("no detecta superposición en rangos contiguos", () => {
    expect(seSuperponen(60, 90, 90, 120)).toBe(false);
  });
});

describe("validarDisponibilidad", () => {
  const horarios = [horario(2, "09:00", "18:00")];

  it("acepta un horario dentro del rango sin bloqueos ni citas", () => {
    expect(validarDisponibilidad("2026-07-14", "10:00", 30, horarios, [], [])).toBeNull();
  });

  it("rechaza un horario fuera del rango de atención", () => {
    expect(validarDisponibilidad("2026-07-14", "19:00", 30, horarios, [], [])).toMatch(/fuera del horario/);
  });

  it("rechaza un horario en un día sin atención", () => {
    // 2026-07-15 es miércoles, sin horario configurado.
    expect(validarDisponibilidad("2026-07-15", "10:00", 30, horarios, [], [])).toMatch(/fuera del horario/);
  });

  it("rechaza un horario bloqueado todo el día", () => {
    const bloqueos: BloqueoAgenda[] = [
      { id: "b1", fecha: "2026-07-14", todoElDia: true, creadoEn: "2026-07-01T00:00:00" },
    ];
    expect(validarDisponibilidad("2026-07-14", "10:00", 30, horarios, bloqueos, [])).toMatch(/bloqueado/);
  });

  it("rechaza un horario dentro de un bloqueo puntual", () => {
    const bloqueos: BloqueoAgenda[] = [
      { id: "b1", fecha: "2026-07-14", todoElDia: false, horaInicio: "09:30", horaFin: "11:00", creadoEn: "2026-07-01T00:00:00" },
    ];
    expect(validarDisponibilidad("2026-07-14", "10:00", 30, horarios, bloqueos, [])).toMatch(/bloqueado/);
  });

  it("rechaza un horario que choca con una cita existente", () => {
    const citas = [cita({ fechaHora: "2026-07-14T10:00:00", duracionMinutos: 30 })];
    expect(validarDisponibilidad("2026-07-14", "10:15", 30, horarios, [], citas)).toMatch(/Ya hay una cita/);
  });

  it("ignora citas canceladas al validar choques", () => {
    const citas = [cita({ fechaHora: "2026-07-14T10:00:00", duracionMinutos: 30, estado: "cancelada" })];
    expect(validarDisponibilidad("2026-07-14", "10:15", 30, horarios, [], citas)).toBeNull();
  });

  it("ignora la propia cita al editarla (citaIdExcluir)", () => {
    const citas = [cita({ id: "c-editar", fechaHora: "2026-07-14T10:00:00", duracionMinutos: 30 })];
    expect(validarDisponibilidad("2026-07-14", "10:00", 30, horarios, [], citas, "c-editar")).toBeNull();
  });
});

describe("esRetrocesoInvalido", () => {
  it("bloquea volver a un paso anterior del circuito", () => {
    expect(esRetrocesoInvalido("recibido", "agendado")).toBe(true);
    expect(esRetrocesoInvalido("en_limpieza", "agendado")).toBe(true);
    expect(esRetrocesoInvalido("en_limpieza", "recibido")).toBe(true);
    expect(esRetrocesoInvalido("listo_entrega", "agendado")).toBe(true);
    expect(esRetrocesoInvalido("listo_entrega", "recibido")).toBe(true);
    expect(esRetrocesoInvalido("listo_entrega", "en_limpieza")).toBe(true);
  });

  it("permite avanzar o quedarse en el mismo estado", () => {
    expect(esRetrocesoInvalido("agendado", "recibido")).toBe(false);
    expect(esRetrocesoInvalido("recibido", "en_limpieza")).toBe(false);
    expect(esRetrocesoInvalido("en_limpieza", "listo_entrega")).toBe(false);
    expect(esRetrocesoInvalido("recibido", "recibido")).toBe(false);
  });

  it("no restringe estados fuera de la secuencia (finales)", () => {
    expect(esRetrocesoInvalido("retirado", "agendado")).toBe(false);
    expect(esRetrocesoInvalido("listo_entrega", "cancelada")).toBe(false);
  });
});

describe("puedeIngresarTunelDetailing", () => {
  it("permite el ingreso cuando el vehículo ya está en el local (Recibido, En Limpieza, Listo para Entrega)", () => {
    expect(puedeIngresarTunelDetailing("recibido")).toBe(true);
    expect(puedeIngresarTunelDetailing("en_limpieza")).toBe(true);
    expect(puedeIngresarTunelDetailing("listo_entrega")).toBe(true);
  });

  it("rechaza el ingreso si el vehículo todavía no ha llegado o si la cita ya se cerró", () => {
    expect(puedeIngresarTunelDetailing("agendado")).toBe(false);
    expect(puedeIngresarTunelDetailing("retirado")).toBe(false);
    expect(puedeIngresarTunelDetailing("cancelada")).toBe(false);
    expect(puedeIngresarTunelDetailing("no_asistio")).toBe(false);
  });
});
