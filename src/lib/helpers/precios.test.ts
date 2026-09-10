import { describe, expect, it } from "vitest";
import { PASES_INCLUIDOS_X5, PLAN_ILIMITADO_LEGACY, PLAN_X5, planTrasRenovacionSinCliente, requiereValidacionX5 } from "./precios";

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

// Política de rescate de ago-2026, ahora compartida por los dos caminos que
// renuevan sin el cliente delante (webhook de WooCommerce y cron de Oneclick).
describe("planTrasRenovacionSinCliente", () => {
  it("le mantiene el ilimitado al que usó el tope o menos", () => {
    expect(planTrasRenovacionSinCliente(PLAN_ILIMITADO_LEGACY, 0)).toBe(PLAN_ILIMITADO_LEGACY);
    expect(planTrasRenovacionSinCliente(PLAN_ILIMITADO_LEGACY, PASES_INCLUIDOS_X5)).toBe(PLAN_ILIMITADO_LEGACY);
  });

  it("migra al X5 al que se pasó del tope", () => {
    expect(planTrasRenovacionSinCliente(PLAN_ILIMITADO_LEGACY, PASES_INCLUIDOS_X5 + 1)).toBe(PLAN_X5);
  });

  it("al que no tiene plan le vende el que se vende hoy", () => {
    expect(planTrasRenovacionSinCliente(null, 0)).toBe(PLAN_X5);
    expect(planTrasRenovacionSinCliente("", 0)).toBe(PLAN_X5);
  });

  // Trinquete de una sola vía: bajar el uso no devuelve a nadie al plan viejo.
  it("no devuelve al ilimitado al que ya está en el X5", () => {
    expect(planTrasRenovacionSinCliente(PLAN_X5, 0)).toBe(PLAN_X5);
  });
});

// La que de verdad importa, y el motivo por el que el candado mira el mismo
// número que la política: el cron solo puede cobrarle sin firma a un cliente
// del ilimitado viejo si ese cobro NO le cambia el plan. Si alguien mueve uno
// de los dos umbrales y no el otro, esto falla antes de que se cobre de más.
describe("candado del X5 vs política de rescate", () => {
  const legacy = { plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null };
  // Replica la condición de cobrarSuscripcion: se pausa (no se cobra) cuando
  // hace falta validación Y el cobro migraría al cliente.
  const seCobra = (pasadas: number) => !(requiereValidacionX5(legacy) && pasadas > PASES_INCLUIDOS_X5);

  it("nunca le cobra sin firma un cobro que le cambia el plan", () => {
    for (let pasadas = 0; pasadas <= PASES_INCLUIDOS_X5 * 3; pasadas++) {
      if (!seCobra(pasadas)) continue;
      expect(planTrasRenovacionSinCliente(legacy.plan, pasadas)).toBe(legacy.plan);
    }
  });

  it("al que se pasa del tope lo deja pausado en vez de migrarlo", () => {
    expect(seCobra(PASES_INCLUIDOS_X5 + 1)).toBe(false);
    expect(seCobra(PASES_INCLUIDOS_X5)).toBe(true);
  });
});
