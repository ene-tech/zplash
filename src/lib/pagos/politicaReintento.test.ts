import { describe, expect, it } from "vitest";
import { proximoReintento, rachaActual, transbankNoContestoDosVeces, type IntentoCobro } from "./politicaReintento";

// Lo que se fija acá: cuándo el cron vuelve a intentar una tarjeta rechazada
// y cuándo deja de hacerlo, según el código de Transbank. Los días se cuentan
// desde el primer rechazo de la racha, en días calendario de Chile.

// El cron corre a las 13:00 UTC (10:00 en Chile). Día 0 = 1-oct.
const enDia = (d: number, hora = "13:00") => new Date(Date.UTC(2026, 9, 1 + d, Number(hora.slice(0, 2)), Number(hora.slice(3)))).toISOString();
const rechazo = (dia: number, responseCode: number | null, hora?: string): IntentoCobro => ({
  id: `oc${dia}`,
  estado: "rechazada",
  responseCode,
  creadoEn: enDia(dia, hora),
  monto: 19990,
});
const racha = (codigo: number | null, dias: number[]) => dias.map((d) => rechazo(d, codigo));
const decidir = (rechazos: IntentoCobro[], hoy: number) => proximoReintento({ rechazos, hoy: new Date(enDia(hoy)) });

describe("proximoReintento", () => {
  it("sin rechazos en la racha -> cobra", () => {
    expect(decidir([], 0)).toEqual({ accion: "cobrar" });
  });

  describe.each([-3, -6, -1, -96])("código %i: días 1, 2, 3 y después cada 3 hasta el 21", (codigo) => {
    it.each([
      // [rechazos en los días, hoy, decisión]
      [[0], 1, { accion: "cobrar" }],
      [[0, 1], 2, { accion: "cobrar" }],
      [[0, 1, 2], 3, { accion: "cobrar" }],
      [[0, 1, 2, 3], 4, { accion: "esperar", dia: 6 }],
      [[0, 1, 2, 3], 5, { accion: "esperar", dia: 6 }],
      [[0, 1, 2, 3], 6, { accion: "cobrar" }],
      [[0, 1, 2, 3, 6], 7, { accion: "esperar", dia: 9 }],
      [[0, 1, 2, 3, 6, 9, 12, 15, 18], 20, { accion: "esperar", dia: 21 }],
      [[0, 1, 2, 3, 6, 9, 12, 15, 18], 21, { accion: "cobrar" }],
      // El del día 21 también falló: se corta y no se espera a mañana.
      [[0, 1, 2, 3, 6, 9, 12, 15, 18, 21], 21, { accion: "cortar", motivo: "dia_21" }],
      // El cron no corrió unos días: lo atrasado se cobra apenas vuelve...
      [[0, 1, 2, 3, 6, 9, 12, 15, 18], 25, { accion: "cobrar" }],
      // ...y si ese también falla, pasado el 21 ya no hay más.
      [[0, 1, 2, 3, 6, 9, 12, 15, 18, 25], 25, { accion: "cortar", motivo: "dia_21" }],
    ])("rechazos en %j, hoy día %i -> %j", (dias, hoy, esperado) => {
      expect(decidir(racha(codigo, dias), hoy)).toEqual(esperado);
    });
  });

  // Un reintento manual a mitad de semana no corre el calendario: el siguiente
  // del cron sigue siendo el día que tocaba después del último intento.
  it("un rechazo fuera de calendario (manual el día 4) -> el siguiente es el 6", () => {
    expect(decidir(racha(-3, [0, 1, 2, 3, 4]), 5)).toEqual({ accion: "esperar", dia: 6 });
  });

  describe("código -10", () => {
    it("primer rechazo -> espera hasta el día 4", () => {
      expect(decidir(racha(-10, [0]), 1)).toEqual({ accion: "esperar", dia: 4 });
      expect(decidir(racha(-10, [0]), 3)).toEqual({ accion: "esperar", dia: 4 });
    });
    it("día 4 -> el único reintento", () => {
      expect(decidir(racha(-10, [0]), 4)).toEqual({ accion: "cobrar" });
    });
    it("el reintento vuelve a fallar (con cualquier código) -> corta", () => {
      expect(decidir(racha(-10, [0, 4]), 4)).toEqual({ accion: "cortar", motivo: "codigo_10" });
      expect(decidir([rechazo(0, -10), rechazo(4, -3)], 4)).toEqual({ accion: "cortar", motivo: "codigo_10" });
    });
    it("-10 a mitad de una racha de -3 -> un reintento 4 días después de él", () => {
      expect(decidir([rechazo(0, -3), rechazo(1, -10)], 3)).toEqual({ accion: "esperar", dia: 5 });
      expect(decidir([rechazo(0, -3), rechazo(1, -10)], 5)).toEqual({ accion: "cobrar" });
    });
  });

  describe("código -11", () => {
    it("primer rechazo -> corta en el acto", () => {
      expect(decidir(racha(-11, [0]), 0)).toEqual({ accion: "cortar", motivo: "codigo_11" });
    });
    it("tras otros rechazos -> corta igual", () => {
      expect(decidir([rechazo(0, -3), rechazo(1, -11)], 1)).toEqual({ accion: "cortar", motivo: "codigo_11" });
    });
  });

  describe("sin respuesta de Transbank (responseCode null)", () => {
    it("uno -> calendario de los reintentables", () => {
      expect(decidir(racha(null, [0]), 1)).toEqual({ accion: "cobrar" });
    });
    it("dos seguidos -> corta", () => {
      expect(decidir(racha(null, [0, 4]), 4)).toEqual({ accion: "cortar", motivo: "sin_respuesta" });
    });
    it("con un rechazo con código entremedio -> no son seguidos", () => {
      expect(decidir([rechazo(0, null), rechazo(1, -3), rechazo(2, null)], 3)).toEqual({ accion: "cobrar" });
    });
  });

  // Un reintento manual a las 23:30 del 1-oct en Chile queda grabado 02:30 UTC
  // del 2-oct. Contado en UTC, el cron del 2-oct sería "el mismo día" y se
  // saltaría el intento del día 1.
  it("cuenta días de Chile, no de UTC", () => {
    const deNoche = rechazo(1, -3, "02:30"); // 2-oct 02:30 UTC = 1-oct 23:30 Chile
    expect(decidir([deNoche], 1)).toEqual({ accion: "cobrar" });
  });
});

describe("rachaActual", () => {
  const aprobado = (dia: number): IntentoCobro => ({ ...rechazo(dia, 0), estado: "aprobada" });

  it("los rechazos después del último aprobado, del más viejo al más nuevo", () => {
    const historial = [rechazo(3, -3), rechazo(2, -3), aprobado(1), rechazo(0, -3)];
    expect(rachaActual(historial, null).map((r) => r.id)).toEqual(["oc2", "oc3"]);
  });

  // El cliente pagó por otra vía y el cron reagendó al vencimiento: los
  // rechazos del ciclo anterior ya no cuentan, la racha arranca de cero.
  it("los anteriores a la fecha de cobro vigente no cuentan", () => {
    const historial = [rechazo(32, -3), rechazo(3, -3), rechazo(2, -3)];
    expect(rachaActual(historial, enDia(31)).map((r) => r.id)).toEqual(["oc32"]);
  });

  it("ignora las filas que no son rechazos ni aprobados (en_curso)", () => {
    const historial = [rechazo(2, -3), { ...rechazo(1, null), estado: "en_curso" }, rechazo(0, -3)];
    expect(rachaActual(historial, enDia(0)).map((r) => r.id)).toEqual(["oc0", "oc2"]);
  });
});

describe("transbankNoContestoDosVeces", () => {
  it.each([
    [[rechazo(4, null), rechazo(0, null)], true],
    [[rechazo(4, null), rechazo(0, -3)], false],
    [[rechazo(4, null)], false],
    [[{ ...rechazo(4, null), estado: "en_curso" }, rechazo(0, null)], false],
  ])("%j -> %s", (historial, esperado) => {
    expect(transbankNoContestoDosVeces(historial as IntentoCobro[])).toBe(esperado);
  });
});
