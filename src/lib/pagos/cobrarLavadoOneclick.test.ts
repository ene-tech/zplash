import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAVADO_UNICO_WEB_TIPO } from "@/lib/helpers";

// Lo que se fija acá: el cobro de un toque del link del SMS nunca cobra dos
// veces (un lavado pagado por link, sea por el toque o por Webpay; un intento
// cortado se le pregunta a Transbank antes de cobrar de nuevo), cobra el
// precio recalculado con el descuento web de la patente y deja la misma venta
// "Lavado único (Web)" que Webpay.

// Orden de las lecturas de un cobro normal: compras en curso de la patente
// (reconciliación), reserva en curso (dentro del lock), cobro aprobado por
// este link, lavado web desde el SMS, precios.
let respuestas: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const inserts: Record<string, unknown>[] = [];
const siguiente = () => Promise.resolve(respuestas.shift() ?? []);
const thenable = {
  then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => siguiente().then(ok, err),
};
const trasWhere = { ...thenable, limit: siguiente };
// `from()` se await-ea directo en el select de precios (sin where).
const trasFrom = { ...thenable, where: () => trasWhere };
const update = () => ({
  set: (valores: Record<string, unknown>) => ({
    where: () => {
      updates.push(valores);
      return Promise.resolve();
    },
  }),
});
const fakeTx = {
  execute: () => Promise.resolve(),
  select: () => ({ from: () => trasFrom }),
  update,
  transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
};
vi.mock("@/db", () => ({
  getDb: () => ({
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve();
      },
    }),
    update,
  }),
}));

let suscripcion: Record<string, unknown> | null = null;
vi.mock("@/lib/dataAccess/oneclick", () => ({ obtenerSuscripcionOneclickCobrablePorPatente: () => Promise.resolve(suscripcion) }));
let cupon: Record<string, unknown> | null = null;
vi.mock("./cuponPlan", () => ({ buscarCuponDescuentoPlan: () => Promise.resolve(cupon) }));
const pagosAplicados: Record<string, unknown>[] = [];
vi.mock("./aplicarPagoAprobado", () => ({
  aplicarPagoAprobado: (p: Record<string, unknown>) => {
    pagosAplicados.push(p);
    return Promise.resolve({ vencimiento: null });
  },
}));
const autorizarCobro = vi.fn((..._args: unknown[]) => Promise.resolve<{ response_code?: number; authorization_code?: string } | null>({ response_code: 0, authorization_code: "a1" }));
let estadoTransbank: { response_code?: number; authorization_code?: string } | null = null;
vi.mock("./oneclickCobro", () => ({
  MSG_COBRO_SIN_CONFIRMAR: "sin confirmar (plan)",
  autorizarCobro: (...args: unknown[]) => autorizarCobro(...args),
  consultarCobro: () => Promise.resolve(estadoTransbank),
}));

import { cobrarLavadoOneclick } from "./cobrarLavadoOneclick";

const link = {
  codigo: "K7P2QXAB",
  campana: "vuelve",
  clienteId: "c1",
  patente: "ABCD12",
  nombre: "Carolina",
  telefono: "+56911112222",
  nonGrato: false,
  enviadoEn: "2026-11-10T12:00:00.000Z",
};
const cortada = (codigoLink: string) => ({
  id: "cocortado",
  patente: "ABCD12",
  monto: 9990,
  cuponCodigo: null,
  codigoLink,
  suscripcionId: "s1",
  creadoEn: new Date().toISOString(),
});
const contacto = [{ email: "c@x.cl", telefono: "+56911112222" }];

describe("cobrarLavadoOneclick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respuestas = [];
    updates.length = 0;
    inserts.length = 0;
    pagosAplicados.length = 0;
    suscripcion = { id: "s1", patente: "ABCD12", username: "ABCD12", tbkUser: "tbk1", email: "c@x.cl", telefono: "+56911112222" };
    cupon = null;
    estadoTransbank = null;
  });

  it("cobra el lavado con el descuento web y deja la venta Lavado único (Web)", async () => {
    cupon = { codigo: "VUELVE1", valor: 3000, esPorcentaje: false };
    // precios vacío = precio por defecto $9.990
    respuestas = [[], [], [], [], []];

    const { estado } = await cobrarLavadoOneclick(link);

    expect(estado).toBe("aprobada");
    expect(autorizarCobro).toHaveBeenCalledWith("ABCD12", "tbk1", expect.stringMatching(/^co[0-9a-z]{12,}$/), 6990);
    expect(inserts).toEqual([expect.objectContaining({ codigoLink: "K7P2QXAB", monto: 6990, cuponCodigo: "VUELVE1", estado: "en_curso" })]);
    expect(pagosAplicados).toEqual([
      expect.objectContaining({ patente: "ABCD12", monto: 6990, cuponCodigo: "VUELVE1", esServicioAdicional: true, tipoVentaNuevo: LAVADO_UNICO_WEB_TIPO }),
    ]);
    expect(updates).toContainEqual(expect.objectContaining({ estado: "aprobada", authorizationCode: "a1" }));
  });

  it("un link que ya tiene un cobro aprobado no vuelve a cobrar", async () => {
    respuestas = [[], [], [{ id: "coviejo" }]];

    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/ya está pagado/);
    expect(autorizarCobro).not.toHaveBeenCalled();
  });

  it("si ya pagó el lavado por Webpay desde el SMS, el toque no cobra otro", async () => {
    respuestas = [[], [], [], [{ id: "v-webpay" }]];

    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/ya está pagado/);
    expect(autorizarCobro).not.toHaveBeenCalled();
  });

  it("un intento cortado sin respuesta del banco frena el cobro", async () => {
    respuestas = [[cortada(link.codigo)]];

    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/No pudimos confirmar el pago/);
    expect(autorizarCobro).not.toHaveBeenCalled();
  });

  it("un intento cortado de este link que el banco sí aprobó se aplica y no se cobra de nuevo", async () => {
    respuestas = [[cortada(link.codigo)], contacto];
    estadoTransbank = { response_code: 0, authorization_code: "a9" };

    const { estado } = await cobrarLavadoOneclick(link);

    expect(estado).toBe("aprobada");
    expect(autorizarCobro).not.toHaveBeenCalled();
    expect(pagosAplicados).toEqual([expect.objectContaining({ monto: 9990, ventaId: "oc-cocortado", email: "c@x.cl" })]);
  });

  it("uno cortado de OTRO link se aplica sin hacerse pasar por el de este; el lavado que deja frena un segundo cobro", async () => {
    // El lavado aplicado es un "Lavado único (Web)" posterior al SMS: el
    // cliente ya tiene uno pagado sin canjear, así que no se cobra otro.
    respuestas = [[cortada("OTROLINK")], contacto, [], [], [{ id: "oc-cocortado" }]];
    estadoTransbank = { response_code: 0, authorization_code: "a9" };

    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/ya está pagado/);
    expect(pagosAplicados).toEqual([expect.objectContaining({ ventaId: "oc-cocortado" })]);
    expect(autorizarCobro).not.toHaveBeenCalled();
  });

  it("rechazo del banco: queda rechazada y no deja venta", async () => {
    respuestas = [[], [], [], [], []];
    autorizarCobro.mockResolvedValueOnce({ response_code: -1 });

    const { estado } = await cobrarLavadoOneclick(link);

    expect(estado).toBe("rechazada");
    expect(pagosAplicados).toEqual([]);
    expect(updates).toContainEqual(expect.objectContaining({ estado: "rechazada", ventaId: null }));
  });

  it("si el descuento cubre todo no se cobra (se usa en el local)", async () => {
    cupon = { codigo: "GRATIS", valor: 100, esPorcentaje: true };
    respuestas = [[], [], [], [], []];

    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/úsalo en el local/);
    expect(autorizarCobro).not.toHaveBeenCalled();
  });

  it("sin tarjeta guardada o cliente non grato no cobra", async () => {
    suscripcion = null;
    await expect(cobrarLavadoOneclick(link)).rejects.toThrow(/tarjeta guardada/);
    await expect(cobrarLavadoOneclick({ ...link, nonGrato: true })).rejects.toThrow();
    expect(autorizarCobro).not.toHaveBeenCalled();
  });
});
