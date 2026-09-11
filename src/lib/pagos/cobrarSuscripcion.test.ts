import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_ILIMITADO_LEGACY, PLAN_ONECLICK_KEY, PLAN_X5 } from "@/lib/helpers";

// Lo que se fija acá: el candado del paso al X5. Al cliente del ilimitado
// viejo que no aceptó el cambio Y se pasó del tope no se le cobra (no se llama
// a Transbank, la suscripción queda pausada) y se le avisa por correo con su
// propio evento, no con el de "cobro fallido" — su tarjeta está bien.
//
// Al que usó el tope o menos SÍ se le cobra sin firma, porque el pago le
// mantiene el plan: no se le está vendiendo ningún cambio (política de rescate
// de ago-2026, ver planTrasRenovacionSinCliente).

let respuestas: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const siguiente = () => Promise.resolve(respuestas.shift() ?? []);
const chain = {
  from: () => chain,
  where: () => trasWhere,
  limit: siguiente,
};
// `where()` se await-ea directo en el select de precios (termina en inArray, sin
// .limit()) y se encadena con .limit() en los otros dos. Thenable y chainable.
const trasWhere = {
  limit: siguiente,
  then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => siguiente().then(ok, err),
};
const fakeTx = {
  execute: () => Promise.resolve(),
  select: () => chain,
  insert: () => ({ values: () => Promise.resolve() }),
  update: () => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        updates.push(valores);
        return Promise.resolve();
      },
    }),
  }),
  transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
};
vi.mock("@/db", () => ({ getDb: () => ({ transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx) }) }));
// after() fuera de un request de Next tira error: acá se ejecuta al toque.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const authorize = vi.fn(() => Promise.resolve({ details: [{ response_code: 0, authorization_code: "a1" }] }));
vi.mock("@/lib/transbank", () => ({
  oneclickTransaction: () => ({ authorize: () => authorize() }),
  oneclickChildCommerceCode: () => "597055555542",
}));

const avisoValidacionX5 = vi.fn(() => Promise.resolve());
const avisoCobroFallido = vi.fn(() => Promise.resolve());
vi.mock("@/lib/mailing/reglas", () => ({
  evaluarReglasCorreoPorCobroFallido: () => avisoCobroFallido(),
  evaluarReglasCorreoPorValidacionX5: () => avisoValidacionX5(),
}));
vi.mock("@/lib/whatsapp/reglas", () => ({ evaluarReglasPorCobroFallido: () => Promise.resolve() }));
let pasadasDelCiclo = 0;
let sinCliente = false;
const pagosAplicados: Record<string, unknown>[] = [];
vi.mock("./aplicarPagoAprobado", () => ({
  aplicarPagoAprobado: (p: Record<string, unknown>) => {
    pagosAplicados.push(p);
    return Promise.resolve({});
  },
  visitasPeriodoActual: () => Promise.resolve(pasadasDelCiclo),
}));
vi.mock("./cuponPlan", () => ({ buscarCuponDescuentoPlan: () => Promise.resolve(null) }));

import { cobrarSuscripcion } from "./cobrarSuscripcion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suscripcion = { id: "s1", patente: "AB1234", username: "AB1234", tbkUser: "tbk1", proximoCobro: "2026-09-01T00:00:00.000Z", clienteId: null } as any;

describe("cobrarSuscripcion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    pagosAplicados.length = 0;
    pasadasDelCiclo = 0;
    sinCliente = false;
  });

  it("ilimitado viejo sin aceptar Y pasado del tope -> no cobra, pausa y avisa por su propio evento", async () => {
    sinCliente = true;
    pasadasDelCiclo = 6;
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }],
    ];

    const { estado } = await cobrarSuscripcion(suscripcion, { sinCliente });

    expect(estado).toBe("pendiente_validacion");
    expect(authorize).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ estado: "pausada_validacion_x5" })]);
    expect(avisoValidacionX5).toHaveBeenCalled();
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });

  // El caso que abre la política de rescate: sin firma, pero el cobro no le
  // cambia el producto, así que no hay nada que aceptar. Si esto empezara a
  // migrarlo al X5, sería exactamente lo de ago-2026 otra vez.
  it("ilimitado viejo sin aceptar pero dentro del tope -> cobra y le mantiene el plan", async () => {
    sinCliente = true;
    pasadasDelCiclo = 5;
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }],
      [], // ningún cobro aprobado este ciclo
    ];

    const { estado } = await cobrarSuscripcion(suscripcion, { sinCliente });

    expect(estado).toBe("aprobada");
    expect(authorize).toHaveBeenCalled();
    expect(updates).not.toContainEqual(expect.objectContaining({ estado: "pausada_validacion_x5" }));
    expect(avisoValidacionX5).not.toHaveBeenCalled();
    // Lo que de verdad importa: el pago se aplica con las pasadas, para que
    // aplicarPagoAprobado le conserve el ilimitado en vez de escribir el X5.
    expect(pagosAplicados).toEqual([expect.objectContaining({ pasadasDelCicloSinCliente: 5 })]);
  });

  // Si se le cobra, la pausa tiene que levantarse: quedó puesta esperando un sí
  // que ya no hace falta. Dejarla es cobrarle todos los meses a alguien a quien
  // Mi Cuenta le muestra "En pausa" y que el operador no puede suspender.
  it("le saca la pausa del X5 a la suscripción que igual se cobra", async () => {
    sinCliente = true;
    pasadasDelCiclo = 3;
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }],
      [],
    ];

    await cobrarSuscripcion({ ...suscripcion, estado: "pausada_validacion_x5" }, { sinCliente });

    expect(updates).toContainEqual(expect.objectContaining({ estado: "activa" }));
  });

  it("mismo cliente pero ya aceptó el X5 -> cobra normal y no avisa nada", async () => {
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: "2026-09-01T00:00:00.000Z" }],
      [], // ningún cobro aprobado este ciclo
    ];

    const { estado } = await cobrarSuscripcion(suscripcion, { sinCliente });

    expect(estado).toBe("aprobada");
    expect(authorize).toHaveBeenCalled();
    expect(avisoValidacionX5).not.toHaveBeenCalled();
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });
});

// Regresión: cobrarSuscripcion la comparten cuatro llamadores y solo el cron
// pasa `sinCliente`. Cuando el cliente está delante —acaba de apretar
// "Contratar Plan X5" y su aceptación ya está grabada— el cobro TIENE que
// migrarlo. Mientras la política se aplicaba en los cuatro, ese cliente pagaba
// el X5, quedaba con el ilimitado en la ficha y seguía lavando sin tope.
describe("cobrarSuscripcion con el cliente delante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    pagosAplicados.length = 0;
    pasadasDelCiclo = 2;
    sinCliente = false;
  });

  it("no aplica la política de rescate aunque el cliente use poco", async () => {
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: "2026-09-10T00:00:00.000Z" }],
      [],
    ];

    const { estado } = await cobrarSuscripcion(suscripcion, { sinCliente });

    expect(estado).toBe("aprobada");
    expect(pagosAplicados).toEqual([expect.objectContaining({ pasadasDelCicloSinCliente: undefined })]);
  });

  it("sigue frenando al que no aceptó, use lo que use", async () => {
    respuestas = [
      [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }],
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }],
    ];

    const { estado } = await cobrarSuscripcion(suscripcion, { sinCliente });

    expect(estado).toBe("pendiente_validacion");
    expect(authorize).not.toHaveBeenCalled();
  });
});

// Al que la politica de rescate deja en su ilimitado se le cobra el precio de SU
// plan (21.990 por default, la fila no existe en `precios`), no la fila del X5
// — que hoy esta en 19.990 y la comparten las 208 suscripciones del cron. Y el
// heredado sigue mandando hacia abajo. Los dos juntos son "19.990 o 21.990 segun
// corresponda" sin tocarle el precio al resto de la base.
describe("precio del cliente rescatado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    pagosAplicados.length = 0;
    sinCliente = true;
    pasadasDelCiclo = 3;
  });

  const precios = [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }];

  it("sin heredado paga el precio de su plan, no el del X5", async () => {
    respuestas = [precios, [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }], []];
    await cobrarSuscripcion(suscripcion, { sinCliente });
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 21990 })]);
  });

  it("con heredado de la migracion Woo se queda en 19.990", async () => {
    respuestas = [precios, [{ id: "c1", precioPlanHeredado: 19990, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: null }], []];
    await cobrarSuscripcion(suscripcion, { sinCliente });
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 19990 })]);
  });

  // El que YA firmo vio 19.990 en pantalla antes de apretar. Que su ficha siga
  // diciendo ilimitado no lo hace un rescatado: es el que su primer cobro lo
  // rechazo la tarjeta y nunca se le escribio el plan nuevo.
  it("el que ya firmo paga lo que firmo, aunque arrastre el plan viejo", async () => {
    respuestas = [
      precios,
      [{ id: "c1", precioPlanHeredado: null, plan: PLAN_ILIMITADO_LEGACY, aceptoX5En: "2026-09-09T12:00:00.000Z" }],
      [],
    ];
    await cobrarSuscripcion(suscripcion, { sinCliente });
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 19990 })]);
  });

  // El que se paso del tope migra al X5, y a ese si le toca la fila compartida.
  it("el que migra al X5 paga la fila del X5", async () => {
    pasadasDelCiclo = 3;
    respuestas = [precios, [{ id: "c1", precioPlanHeredado: null, plan: PLAN_X5, aceptoX5En: null }], []];
    await cobrarSuscripcion(suscripcion, { sinCliente });
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 19990 })]);
  });
});
