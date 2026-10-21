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
  orderBy: () => ({ limit: siguiente }),
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
// La reserva y la reconciliación de cobros "en_curso" se prueban en
// oneclickCobro.test.ts; acá solo correrían la cola de `respuestas`.
let recuperados: { id: string; monto: number; authorizationCode: string | null }[] = [];
vi.mock("./oneclickCobro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oneclickCobro")>()),
  reservarCobro: () => Promise.resolve(),
  reconciliarCobrosEnCurso: () => Promise.resolve(recuperados),
}));

import { cobrarSuscripcion, inicioCicloCobrado, proximoCicloISO } from "./cobrarSuscripcion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suscripcion = { id: "s1", patente: "AB1234", username: "AB1234", tbkUser: "tbk1", proximoCobro: "2026-09-01T00:00:00.000Z", clienteId: null } as any;

describe("cobrarSuscripcion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    pagosAplicados.length = 0;
    pasadasDelCiclo = 0;
    sinCliente = false;
    recuperados = [];
  });

  // Un intento anterior se cortó después de que Transbank aprobó: ese cargo es
  // el pago del ciclo. Se aplica con el monto cobrado y NO se vuelve a cobrar.
  it("cargo recuperado de un intento cortado -> lo aplica y no cobra de nuevo", async () => {
    recuperados = [{ id: "ocviejo", monto: 19990, authorizationCode: "a9" }];

    const { estado } = await cobrarSuscripcion(suscripcion);

    expect(estado).toBe("aprobada");
    expect(authorize).not.toHaveBeenCalled();
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 19990, ventaId: "oc-ocviejo" })]);
    expect(updates).toContainEqual(expect.objectContaining({ estado: "aprobada", authorizationCode: "a9", ventaId: "oc-ocviejo" }));
    expect(avisoCobroFallido).not.toHaveBeenCalled();
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

// Cobro rechazado: se reintenta al día siguiente (no al mes), y el aviso al
// cliente sale solo en el primer rechazo, no en cada reintento diario.
describe("reintento diario tras un rechazo", () => {
  const precios = [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }];
  const cliente = [{ id: "c1", precioPlanHeredado: null, plan: PLAN_X5, aceptoX5En: "2026-09-01T00:00:00.000Z" }];
  const unDia = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    authorize.mockResolvedValueOnce({ details: [{ response_code: -1, authorization_code: "" }] });
  });

  // La fecha vencida se conserva: el cron la vuelve a ver mañana y el ciclo
  // siguiente se cuenta desde ella, así que los reintentos no corren el día.
  it("primer rechazo -> conserva la fecha del ciclo y avisa", async () => {
    respuestas = [precios, cliente, [], [{ estado: "aprobada" }]];
    const { estado } = await cobrarSuscripcion(suscripcion);
    expect(estado).toBe("rechazada");
    expect(updates.at(-1)!.proximoCobro).toBe(suscripcion.proximoCobro);
    expect(avisoCobroFallido).toHaveBeenCalled();
  });

  it("reintento rechazado -> no avisa de nuevo", async () => {
    respuestas = [precios, cliente, [], [{ estado: "rechazada" }]];
    await cobrarSuscripcion(suscripcion);
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });

  it("rechazo con la fecha en el futuro -> la adelanta a mañana", async () => {
    respuestas = [precios, cliente, [], []];
    await cobrarSuscripcion({ ...suscripcion, proximoCobro: new Date(Date.now() + 10 * unDia).toISOString() });
    const faltan = new Date(updates.at(-1)!.proximoCobro as string).getTime() - Date.now();
    expect(faltan).toBeGreaterThan(unDia - 2 * 60 * 60 * 1000);
    expect(faltan).toBeLessThan(unDia);
  });

  it("aprobado tras reintentos -> el próximo ciclo sale de la fecha original", async () => {
    authorize.mockReset().mockResolvedValue({ details: [{ response_code: 0, authorization_code: "a1" }] });
    respuestas = [precios, cliente, [], [{ estado: "rechazada" }]];
    await cobrarSuscripcion(suscripcion);
    expect(updates.at(-1)!.proximoCobro).toBe(proximoCicloISO(suscripcion.proximoCobro));
  });
});

// El bucle 'en_curso' de oct-2026 (KTJB16): Transbank no contesta ni el cobro
// ni la consulta, intento tras intento. Con dos seguidos sin respuesta el cron
// ya no reserva otro: corta el reintento automático y avisa con el link.
describe("Transbank no contestó dos veces seguidas", () => {
  const precios = [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }];
  const cliente = [{ id: "c1", precioPlanHeredado: null, plan: PLAN_X5, aceptoX5En: "2026-09-01T00:00:00.000Z" }];
  const sinRespuesta = (id: string, creadoEn: string) => ({ id, estado: "rechazada", responseCode: null, creadoEn, monto: 19990 });
  const historial = [sinRespuesta("oc2", "2026-10-18T13:00:00.000Z"), sinRespuesta("oc1", "2026-10-14T13:00:00.000Z")];

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    recuperados = [];
    pasadasDelCiclo = 0;
  });

  it("en el cron -> no llama a Transbank, deja la suscripción sin fecha y avisa", async () => {
    respuestas = [precios, cliente, [], historial];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada", cortado: true });
    expect(authorize).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ proximoCobro: null })]);
    expect(avisoCobroFallido).toHaveBeenCalled();
  });

  it("con alguien delante (operador, re-inscripción) -> se intenta igual", async () => {
    respuestas = [precios, cliente, [], historial];
    const { estado } = await cobrarSuscripcion(suscripcion);
    expect(estado).toBe("aprobada");
    expect(authorize).toHaveBeenCalled();
  });

  // Cortada, el cliente pagó por el link y el cron la reagendó: los dos sin
  // respuesta quedaron antes de la fecha nueva y no cortan el ciclo siguiente.
  it("dos sin respuesta de un ciclo anterior -> se cobra normal", async () => {
    respuestas = [precios, cliente, [], historial];
    await cobrarSuscripcion({ ...suscripcion, proximoCobro: "2026-10-19T13:00:00.000Z" }, { sinCliente: true });
    expect(authorize).toHaveBeenCalled();
  });

  it("uno solo sin respuesta -> se intenta de nuevo", async () => {
    const haceDias = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
    respuestas = [precios, cliente, [], [sinRespuesta("oc2", haceDias(1)), { ...sinRespuesta("oc1", haceDias(2)), responseCode: -1 }]];
    await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(authorize).toHaveBeenCalled();
  });

  // Un reintento manual rechazado sobre una suscripción cortada (sin fecha) no
  // puede reagendarla para mañana: reabriría el cobro diario que se cortó.
  it("rechazo sin fecha de cobro -> sigue sin fecha", async () => {
    authorize.mockResolvedValueOnce({ details: [{ response_code: -1, authorization_code: "" }] });
    respuestas = [precios, cliente, [], []];
    await cobrarSuscripcion({ ...suscripcion, proximoCobro: null });
    expect(updates.at(-1)!.proximoCobro).toBeNull();
  });
});

// La política de reintento por código (la tabla completa está en
// politicaReintento.test.ts): acá se fija que cobrarSuscripcion la aplique solo
// en el cron, que "esperar" no toque nada y que el corte deje la suscripción
// sin fecha y mande el aviso.
describe("política de reintento en el cron", () => {
  const precios = [{ plan: PLAN_ONECLICK_KEY, normal: 19990, promo: 0 }];
  const cliente = [{ id: "c1", precioPlanHeredado: null, plan: PLAN_X5, aceptoX5En: "2026-09-01T00:00:00.000Z" }];
  const haceDias = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
  // Historial del más nuevo al más viejo, como lo devuelve la consulta.
  const rechazosEn = (codigo: number, diasAtras: number[]) =>
    diasAtras.map((d) => ({ id: `oc${d}`, estado: "rechazada", responseCode: codigo, creadoEn: haceDias(d), monto: 19990 }));
  const rechazarCon = (codigo: number) => authorize.mockResolvedValueOnce({ details: [{ response_code: codigo, authorization_code: "" }] });

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    recuperados = [];
    pasadasDelCiclo = 0;
  });

  it("día 4 de una racha de -3 -> en_espera: no llama a Transbank ni escribe nada", async () => {
    respuestas = [precios, cliente, [], rechazosEn(-3, [1, 2, 3, 4])];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "en_espera" });
    expect(authorize).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(avisoCobroFallido).not.toHaveBeenCalled();
  });

  it("la misma racha con el operador delante -> cobra igual", async () => {
    respuestas = [precios, cliente, [], rechazosEn(-3, [1, 2, 3, 4])];
    const { estado } = await cobrarSuscripcion(suscripcion);
    expect(estado).toBe("aprobada");
  });

  it("primer rechazo -3 -> conserva la fecha y avisa una vez", async () => {
    rechazarCon(-3);
    respuestas = [precios, cliente, [], []];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada" });
    expect(updates.at(-1)!.proximoCobro).toBe(suscripcion.proximoCobro);
    expect(avisoCobroFallido).toHaveBeenCalledTimes(1);
  });

  it("primer rechazo -11 -> corta en el acto y avisa", async () => {
    rechazarCon(-11);
    respuestas = [precios, cliente, [], []];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada", cortado: true });
    expect(updates.at(-1)!.proximoCobro).toBeNull();
    expect(avisoCobroFallido).toHaveBeenCalledTimes(1);
  });

  it("-10 que vuelve a fallar a los 4 días -> corta y avisa (aunque ya avisó el primero)", async () => {
    rechazarCon(-10);
    respuestas = [precios, cliente, [], rechazosEn(-10, [4])];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada", cortado: true });
    expect(updates.at(-1)!.proximoCobro).toBeNull();
    expect(avisoCobroFallido).toHaveBeenCalled();
  });

  it("falla el intento del día 21 -> corta y avisa", async () => {
    rechazarCon(-6);
    respuestas = [precios, cliente, [], rechazosEn(-6, [3, 6, 9, 12, 15, 18, 19, 20, 21])];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada", cortado: true });
    expect(updates.at(-1)!.proximoCobro).toBeNull();
    expect(avisoCobroFallido).toHaveBeenCalled();
  });

  // La racha ya se agotó con un intento que no fue del cron (un reintento
  // manual el día 21): el cron corta sin volver a llamar a Transbank.
  it("racha ya agotada -> corta sin cobrar", async () => {
    respuestas = [precios, cliente, [], rechazosEn(-3, [0, 3, 6, 9, 12, 15, 18, 19, 20, 21])];
    const resultado = await cobrarSuscripcion(suscripcion, { sinCliente: true });
    expect(resultado).toEqual({ estado: "rechazada", cortado: true });
    expect(authorize).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ proximoCobro: null })]);
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

describe("inicioCicloCobrado", () => {
  const ahora = new Date("2026-09-20T13:00:00.000Z");

  // JWCY71: upgrade aprobado el 9-sep, renovación con fecha 20-sep. El
  // aprobado es anterior a la fecha de cobro, así que no frena la renovación.
  it("fecha de cobro vencida -> el ciclo arranca en esa fecha", () => {
    expect(inicioCicloCobrado("2026-09-18T15:00:00.000Z", ahora)).toBe("2026-09-18T15:00:00.000Z");
  });

  it("fecha reciente, futura o vacía -> al menos las últimas 24h", () => {
    const haceUnDia = "2026-09-19T13:00:00.000Z";
    expect(inicioCicloCobrado("2026-09-20T10:00:00.000Z", ahora)).toBe(haceUnDia);
    expect(inicioCicloCobrado("2026-10-20T00:00:00.000Z", ahora)).toBe(haceUnDia);
    expect(inicioCicloCobrado(null, ahora)).toBe(haceUnDia);
  });
});
