import { beforeEach, describe, expect, it, vi } from "vitest";

// El ticket de la promo es un lavado gratis y va una sola vez por cliente:
// lo que se fija acá es que salga canjeable por cualquier vehículo (sin
// patentes autorizadas), vigente hasta el cierre de la campaña (y a 30 días
// corridos una vez pasada), con su correo de confirmación, y que un segundo
// registro de tarjeta NO emita otro.

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => mockDb }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

type Envio = { to: string; subject: string; html: string };
const mockEnviar = vi.fn((envio: Envio) => Promise.resolve({ ok: !!envio.to }));
vi.mock("@/lib/mailing/proveedor", () => ({ enviarCorreoTransaccional: (envio: Envio) => mockEnviar(envio) }));

const insertados: Record<string, unknown>[] = [];
// Cupones ya emitidos de la promo: vacío = el cliente todavía no la usó.
let yaOtorgados: unknown[] = [];

// El builder de drizzle es "thenable": el select de códigos se espera directo
// (sin .where()), los otros dos terminan en .where().limit().
let llamada = 0;
const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => {
          llamada += 1;
          // 1º la ficha del cliente, 2º el chequeo de "ya la usó".
          return Promise.resolve(llamada === 1 ? [{ id: "c1", nombre: "Ana", email: "Ficha@Ejemplo.cl" }] : yaOtorgados);
        },
      }),
      then: (resolver: (filas: unknown[]) => void) => resolver([{ codigo: "AAAAAA" }]),
    }),
  }),
  insert: () => ({
    values: (fila: Record<string, unknown>) => {
      insertados.push(fila);
      return Promise.resolve();
    },
  }),
};

import { DIAS_TICKET_REACTIVACION, FIN_PROMO_TICKET, LOTE_TICKET_REACTIVACION, otorgarTicketReactivacion } from "./ticketReactivacion";

describe("otorgarTicketReactivacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertados.length = 0;
    yaOtorgados = [];
    llamada = 0;
  });

  it("emite un vale abierto que vence al cierre de la campaña y manda el código por correo", async () => {
    const codigo = await otorgarTicketReactivacion({ patente: "ABCD12", email: "inscripcion@ejemplo.cl", creadoPor: "test" });
    const fila = insertados.at(-1)!;

    expect(codigo).toHaveLength(6);
    expect(codigo).not.toBe("AAAAAA");
    expect(fila.tipo).toBe("vale");
    expect(fila.nombreLote).toBe(LOTE_TICKET_REACTIVACION);
    // Sin patentesAutorizadas: cualquier vehículo lo canjea. patenteAsignada
    // no restringe un "vale", solo marca quién ganó la promo.
    expect(fila.patentesAutorizadas).toBeUndefined();
    expect(fila.patenteAsignada).toBe("ABCD12");
    // El correo de la ficha manda sobre el que se usó al inscribir la tarjeta.
    expect(fila.email).toBe("ficha@ejemplo.cl");
    // Durante la campaña la fecha es fija (la que promete el correo), no
    // "hoy + 30 días": el que reactiva el último día no arrastra el lavado
    // gratis un mes más allá del cierre.
    expect(fila.fechaCaducidad).toBe(FIN_PROMO_TICKET.toISOString());

    expect(mockEnviar).toHaveBeenCalledTimes(1);
    const envio = mockEnviar.mock.calls[0]![0];
    expect(envio.to).toBe("ficha@ejemplo.cl");
    expect(envio.subject).toContain(codigo);
    expect(envio.html).toContain(codigo);
  });

  it("pasada la campaña vuelve a los 30 días corridos, sin emitir tickets ya vencidos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIN_PROMO_TICKET.getTime() + 86400000));
    try {
      const antes = Date.now();
      await otorgarTicketReactivacion({ patente: "ABCD12", email: "inscripcion@ejemplo.cl", creadoPor: "test" });
      const dias = (new Date(insertados.at(-1)!.fechaCaducidad as string).getTime() - antes) / 86400000;
      expect(dias).toBeGreaterThan(DIAS_TICKET_REACTIVACION - 0.01);
      expect(dias).toBeLessThan(DIAS_TICKET_REACTIVACION + 0.01);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no emite un segundo ticket a quien ya usó la promo", async () => {
    yaOtorgados = [{ id: "cupon-viejo" }];
    const codigo = await otorgarTicketReactivacion({ patente: "ABCD12", email: "inscripcion@ejemplo.cl", creadoPor: "test" });

    expect(codigo).toBeNull();
    expect(insertados).toHaveLength(0);
    expect(mockEnviar).not.toHaveBeenCalled();
  });
});
