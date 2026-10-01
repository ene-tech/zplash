import { describe, expect, it } from "vitest";
import { duracionCita, duracionServicioTamano } from "./servicios";

const base = { id: "chasis-grafitado", nombre: "Chasis", duracionMinutos: 240, activo: true };

describe("duracionServicioTamano", () => {
  it("usa los minutos de la talla cuando están cargados", () => {
    expect(duracionServicioTamano({ ...base, duracionTamano: { s: 120, m: 150, l: 180, xl: 0 } }, "m")).toBe(150);
  });

  it("cae en la duración general si la talla está en 0, no hay tabla o no se sabe la talla", () => {
    const s = { ...base, duracionTamano: { s: 120, m: 150, l: 180, xl: 0 } };
    expect(duracionServicioTamano(s, "xl")).toBe(240);
    expect(duracionServicioTamano(s, null)).toBe(240);
    expect(duracionServicioTamano(base, "s")).toBe(240);
  });
});

describe("duracionCita", () => {
  const cfg = { agendaDescuentoCombinadoPct: 20, agendaTopeMinutos: 0 };
  it("un solo servicio no se rebaja", () => expect(duracionCita([240], cfg)).toBe(240));
  it("dos o más se rebajan el %: 240 + 150 = 390 → 312", () => expect(duracionCita([240, 150], cfg)).toBe(312));
  it("respeta el tope, también con un solo servicio", () => {
    expect(duracionCita([240, 150], { ...cfg, agendaTopeMinutos: 300 })).toBe(300);
    expect(duracionCita([400], { ...cfg, agendaTopeMinutos: 300 })).toBe(300);
  });
});
