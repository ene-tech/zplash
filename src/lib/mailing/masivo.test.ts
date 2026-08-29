import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, ReglaCorreo } from "@/types";
import type { OfertaPlan } from "@/lib/helpers/ofertasPlan";

// Lo que se fija acá es que el envío masivo LLENE {{montoDescuento}} y
// {{montoAPagar}} con el cupón de la patente. Es un bug invisible en tipos y
// en el render: construirVariables acepta los dos campos aunque nadie se los
// pase, así que una plantilla que los use se enviaría muda (justo lo que pasó
// con {{precioReactivacion}} en la tanda del 27-ago-2026).

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  getDb: () => {
    throw new Error("el test no debería tocar la base");
  },
}));

let clientes: Cliente[] = [];
let oferta: OfertaPlan = {};
let cupon: { esPorcentaje: boolean; valor: number } | undefined;
let variablesEnviadas: Record<string, string> | undefined;

vi.mock("@/lib/dataAccess/clientes", () => ({ getClientesByIds: () => Promise.resolve(clientes) }));
vi.mock("@/lib/dataAccess/ofertasPlan", () => ({ calcularOfertasPlanDeCliente: () => Promise.resolve(oferta) }));
vi.mock("@/lib/pagos/cuponPlan", () => ({ buscarCuponDescuentoPlan: () => Promise.resolve(cupon) }));
vi.mock("@/lib/dataAccess/mail", () => ({
  obtenerOCrearReglaEnvioManual: () => Promise.resolve({ id: "r1", nombre: "percha", plantillaCorreoId: "p1" } as ReglaCorreo),
  registrarDisparoReglaCorreo: () => Promise.resolve({ id: "d1" }),
}));
// construirVariables va REAL (es quien formatea a CLP y lo que la plantilla
// termina viendo); solo se intercepta el envío para mirar lo que recibió.
vi.mock("./reglas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reglas")>()),
  ejecutarAccionReglaCorreo: (_r: ReglaCorreo, _d: string, _c: Cliente, variables: Record<string, string>) => {
    variablesEnviadas = variables;
    return Promise.resolve(true);
  },
}));

import { enviarCorreosMasivos } from "./masivo";

const CLIENTE = {
  id: "c1",
  nombre: "Ana",
  patente: "SZGH65",
  plan: "Plan Ilimitado Mensual",
  email: "ana@ejemplo.cl",
  vencimiento: "2026-08-01T00:00:00.000Z",
} as Cliente;

// Precio real de un vencido con tramo de reactivación: lo que ve el cliente en
// Mi Cuenta antes de aplicarle el cupón de su patente.
const REACTIVACION: OfertaPlan = { reactivacion: { precio: 21990, diasVencido: 28, pNormal: 21990, visitas: 3 } };

async function enviar(): Promise<Record<string, string> | undefined> {
  variablesEnviadas = undefined;
  await enviarCorreosMasivos({ plantillaCorreoId: "p1", clienteIds: ["c1"] });
  return variablesEnviadas;
}

beforeEach(() => {
  clientes = [CLIENTE];
  oferta = REACTIVACION;
  cupon = undefined;
});

describe("enviarCorreosMasivos: variables de descuento", () => {
  it("cupón de monto fijo: {{montoDescuento}} es la plata del cupón y {{montoAPagar}} lo que queda", async () => {
    cupon = { esPorcentaje: false, valor: 4000 };
    const v = await enviar();
    expect(v?.montoDescuento).toBe("$4.000");
    expect(v?.montoAPagar).toBe("$17.990");
    // Mismo número que {{precioReactivacion}}: son dos nombres para el precio
    // que después cobra Oneclick, no dos precios distintos.
    expect(v?.precioReactivacion).toBe("$17.990");
  });

  // El caso por el que el descuento se mide contra el precio SIN cupón: con un
  // cupón de porcentaje, "cuánta plata tiene disponible" no es su `valor`.
  it("cupón de porcentaje: el descuento sale del precio base, no del valor del cupón", async () => {
    cupon = { esPorcentaje: true, valor: 20 };
    const v = await enviar();
    expect(v?.montoDescuento).toBe("$4.398");
    expect(v?.montoAPagar).toBe("$17.592");
  });

  // precioConCupon topa el precio en $0; el descuento tiene que toparse en la
  // misma base o el correo anuncia un precio de lista que no existe.
  it("cupón más grande que el plan: el descuento se topa en el precio, no lo pasa", async () => {
    cupon = { esPorcentaje: false, valor: 25000 };
    const v = await enviar();
    expect(v?.montoDescuento).toBe("$21.990");
    expect(v?.montoAPagar).toBe("$0");
  });

  it("sin cupón vigente: {{montoDescuento}} vacío y se paga el precio de la promo", async () => {
    const v = await enviar();
    expect(v?.montoDescuento).toBe("");
    expect(v?.montoAPagar).toBe("$21.990");
  });

  // Sin tramo de reactivación el cupón no se aplica en la web (la inscripción
  // cae en cobrarSuscripcion, que no lo mira): el correo no puede anunciar un
  // descuento que el cliente no va a ver.
  it("sin tramo de reactivación: no se anuncia descuento aunque haya cupón", async () => {
    oferta = {};
    cupon = { esPorcentaje: false, valor: 4000 };
    const v = await enviar();
    expect(v?.montoDescuento).toBe("");
    expect(v?.montoAPagar).toBe("");
  });
});
