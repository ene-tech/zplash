import { describe, expect, it } from "vitest";
import { PLAN_ILIMITADO_LEGACY, PLAN_X5, requiereValidacionX5 } from "./precios";

// El candado que impide repetir lo de ago-2026: 150 clientes del plan
// ilimitado quedaron en el X5 sin que nadie les preguntara, porque toda
// renovación escribía el plan nuevo. requiereValidacionX5 separa al cliente que
// todavía no eligió del que ya eligió: los caminos con un click detrás (web,
// Mi Cuenta, mesón) registran la aceptación antes de cobrar, y el cron —que no
// tiene click— se frena. Si esto devuelve mal, vuelve a pasar.
describe("requiereValidacionX5", () => {
  it("exige aceptación al cliente del ilimitado viejo que nunca la dio", () => {
    expect(requiereValidacionX5({ plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null })).toBe(true);
  });

  it("no vuelve a preguntarle al que ya aceptó", () => {
    expect(requiereValidacionX5({ plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: "2026-09-01T12:00:00.000Z" })).toBe(false);
  });

  it("no le pregunta a quien ya está en el X5", () => {
    expect(requiereValidacionX5({ plan: PLAN_X5, aceptoX5En: null })).toBe(false);
  });

  // Mira `plan` y no planVigente a propósito: el que ya pagó el X5 arrastrando
  // su mes sin tope tiene plan = X5 y planVigente = ilimitado. A ese no hay
  // nada que preguntarle — su producto ya cambió y lo pagó — y preguntárselo
  // le bloquearía la renovación siguiente sin motivo.
  it("no le pregunta al que ya pagó el X5 y arrastra el mes sin tope", () => {
    expect(requiereValidacionX5({ plan: PLAN_X5, aceptoX5En: null })).toBe(false);
  });

  it("no le pregunta a quien nunca tuvo plan", () => {
    expect(requiereValidacionX5({ plan: null, aceptoX5En: null })).toBe(false);
    expect(requiereValidacionX5({ plan: undefined, aceptoX5En: undefined })).toBe(false);
  });
});
