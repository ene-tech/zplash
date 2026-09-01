import { describe, expect, it } from "vitest";
import { guardarClienteModal, type DatosClienteModal } from "./clientes";
import { esAdministracionOGerencia } from "@/lib/helpers";
import type { AppData, Cliente } from "@/types";

// El precio heredado es lo que le termina cobrando la renovación (ver
// precioConHeredado): que se borre al guardar la ficha desde el operador le
// subiría el plan en silencio de $19.990 a $21.990.
const cliente: Cliente = {
  id: "c1",
  nombre: "MARCOS VALERIA",
  patente: "SKTB49",
  plan: "Plan X5",
  vencimiento: "2026-09-28T00:00:00.000Z",
  precioPlanHeredado: 19990,
  creadoEn: "2026-01-01T00:00:00.000Z",
};

const data = { clientes: [cliente], ventas: [], ingresos: [], empresas: [] } as unknown as AppData;

const datos = (extra: Partial<DatosClienteModal>): DatosClienteModal => ({
  clienteExistente: cliente,
  contexto: "admin",
  perfilNombre: "Gerencia",
  nombre: cliente.nombre,
  patente: cliente.patente,
  telefono: "",
  email: "",
  vehiculo: "",
  tipoDocumento: "Boleta",
  razonSocial: "",
  rut: "",
  direccion: "",
  giro: "",
  plan: "Plan X5",
  vencimiento: cliente.vencimiento!,
  origen: "LOCAL",
  ...extra,
});

const guardado = (extra: Partial<DatosClienteModal>) =>
  guardarClienteModal(data, datos(extra)).clientes!.find((c) => c.id === "c1")!;

describe("guardarClienteModal — precio heredado", () => {
  it("guarda el valor que puso el admin", () => {
    expect(guardado({ precioPlanHeredado: 17990 }).precioPlanHeredado).toBe(17990);
  });

  it("lo borra cuando el admin deja el campo vacío", () => {
    expect(guardado({ precioPlanHeredado: null }).precioPlanHeredado).toBeNull();
  });

  it("lo conserva cuando el campo no viene (operador, o perfil sin permiso)", () => {
    expect(guardado({ contexto: "operador" }).precioPlanHeredado).toBe(19990);
  });

  it("un cliente nuevo entra sin precio heredado", () => {
    const patch = guardarClienteModal(data, datos({ clienteExistente: null, patente: "AB1234" }));
    expect(patch.clientes!.at(-1)!.precioPlanHeredado).toBeNull();
  });
});

describe("guardarClienteModal — ancla del ciclo de pases", () => {
  // Un cliente con plan no puede quedar sin fecha_contratacion: sin ella
  // periodoPlan deduce la ventana del vencimiento, y esa deducción se rompe en
  // las anclas 29/30/31 (ver anclaCicloAGuardar y el caso HYRL56).
  // Deliberadamente NO se inventa un ancla acá: ver anclaCicloAGuardar.
  it("el vencimiento tipeado a mano por el admin no inventa una contratación", () => {
    expect(guardado({ vencimiento: "2026-09-30T15:00:00.000Z" }).fechaContratacion).toBeNull();
  });

  it("no le mueve el ciclo a quien ya tiene ancla propia", () => {
    const conAncla = { ...cliente, fechaContratacion: "2026-08-31T18:15:07.083Z" };
    const patch = guardarClienteModal(
      { ...data, clientes: [conAncla] } as unknown as AppData,
      datos({ clienteExistente: conAncla, vencimiento: "2026-09-30T15:00:00.000Z" })
    );
    expect(patch.clientes!.find((c) => c.id === "c1")!.fechaContratacion).toBe("2026-08-31T18:15:07.083Z");
  });

  it("sin plan no hay ancla que guardar", () => {
    expect(guardado({ plan: "", vencimiento: null }).fechaContratacion).toBeNull();
  });
});

describe("quién ve el campo", () => {
  it("solo Administración y Gerencia", () => {
    expect(esAdministracionOGerencia("Gerencia")).toBe(true);
    expect(esAdministracionOGerencia("Administración")).toBe(true);
    expect(esAdministracionOGerencia("Omar")).toBe(false);
    expect(esAdministracionOGerencia(undefined)).toBe(false);
  });
});
