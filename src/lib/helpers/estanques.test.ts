import { describe, expect, it } from "vitest";
import { MAX_APERTURA_MS, aperturaCaducada, debeCerrarPorLleno, litrosDesdeCrudo, nivelEstanque } from "./estanques";
import type { EstanqueConLectura } from "@/types";

const AHORA = new Date("2026-08-18T15:00:00Z").getTime();
const haceMs = (ms: number) => new Date(AHORA - ms).toISOString();

// Estanque de 1.000 L, 100 cm útiles: 10 L por cm de columna, con el sensor
// apoyado 5 cm sobre el fondo (offset).
const base: EstanqueConLectura = {
  id: "e1",
  nombre: "AGUA CRUDA",
  capacidadLitros: 1000,
  offsetCrudo: 5,
  litrosPorUnidad: 10,
  activo: true,
  orden: 0,
  creadoEn: haceMs(0),
  ultima: null,
};

const con = (crudo: number, edadMs = 0, extra: Partial<EstanqueConLectura> = {}): EstanqueConLectura => ({
  ...base,
  ...extra,
  ultima: { crudo, medidoEn: haceMs(edadMs) },
});

describe("litrosDesdeCrudo", () => {
  it("descuenta el offset y escala a litros", () => {
    expect(litrosDesdeCrudo(base, 55)).toBe(500);
  });

  it("no devuelve litros negativos si el sensor lee bajo su propio offset", () => {
    expect(litrosDesdeCrudo(base, 2)).toBe(0);
  });

  it("soporta un ultrasónico, que mide distancia al agua (escala negativa)", () => {
    // Estanque lleno = 20 cm de aire; vacío = 120 cm.
    const ultra = { offsetCrudo: 120, litrosPorUnidad: -10 };
    expect(litrosDesdeCrudo(ultra, 20)).toBe(1000);
    expect(litrosDesdeCrudo(ultra, 120)).toBe(0);
  });
});

describe("nivelEstanque", () => {
  it("clasifica normal / bajo / crítico contra el umbral", () => {
    expect(nivelEstanque(con(55), AHORA).cls).toBe("ok");
    expect(nivelEstanque(con(30), AHORA).label).toBe("Bajo"); // 250 L, entre 200 y 300
    expect(nivelEstanque(con(15), AHORA).label).toBe("Crítico"); // 100 L, bajo el 20%
  });

  it("respeta el umbral propio del estanque por sobre el 20% por defecto", () => {
    expect(nivelEstanque(con(55, 0, { umbralBajoLitros: 600 }), AHORA).label).toBe("Crítico");
  });

  it("marca lleno al llegar a la capacidad", () => {
    expect(nivelEstanque(con(105), AHORA).label).toBe("Lleno");
    expect(nivelEstanque(con(200), AHORA).porcentaje).toBe(100); // la barra no se pasa de 100
  });

  it("no muestra un nivel viejo como si fuera el actual", () => {
    const viejo = nivelEstanque(con(55, 10 * 60 * 1000), AHORA);
    expect(viejo.label).toBe("Sin señal");
    expect(viejo.litros).toBeNull();
    expect(nivelEstanque(base, AHORA).label).toBe("Sin señal");
  });
});

describe("debeCerrarPorLleno", () => {
  it("corta el llenado cuando el estanque llegó a la capacidad", () => {
    expect(debeCerrarPorLleno(base, 105)).toBe(true);
    expect(debeCerrarPorLleno(base, 55)).toBe(false);
  });

  it("no corta sin lectura de este ciclo: ahí manda la boya mecánica, no el software", () => {
    expect(debeCerrarPorLleno(base, null)).toBe(false);
  });
});

describe("aperturaCaducada", () => {
  const abierta = (edadMs: number) => ({ abierta: true, cambiadoEn: haceMs(edadMs) });

  it("deja pasar una apertura reciente", () => {
    expect(aperturaCaducada(abierta(10 * 60 * 1000), AHORA)).toBe(false);
  });

  it("caduca la apertura que quedó colgada: el controlador vuelve del corte y no reabre solo", () => {
    expect(aperturaCaducada(abierta(MAX_APERTURA_MS + 1), AHORA)).toBe(true);
  });

  it("una válvula cerrada nunca caduca", () => {
    expect(aperturaCaducada({ abierta: false, cambiadoEn: haceMs(99 * 60 * 60 * 1000) }, AHORA)).toBe(false);
  });

  it("con fecha ilegible corta el agua en vez de dejarla abierta", () => {
    expect(aperturaCaducada({ abierta: true, cambiadoEn: "cualquier cosa" }, AHORA)).toBe(true);
  });
});
