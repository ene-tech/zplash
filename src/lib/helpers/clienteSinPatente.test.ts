import { describe, expect, it } from "vitest";
import { cuponesVigentesDeCliente, findClient, rechazoClienteSinPatente } from "@/lib/helpers";
import { validarClienteModal, type DatosValidacionClienteModal } from "@/components/modals/validarClienteModal";
import type { Cliente, Cupon } from "@/types";

const cliente = (extra: Partial<Cliente>): Cliente => ({
  id: "c1",
  nombre: "ANA",
  patente: "",
  origen: "LOCAL",
  visitas: 0,
  creadoEn: "2026-10-01T00:00:00.000Z",
  ...extra,
});

describe("findClient", () => {
  it("una patente vacía no calza con un comprador sin auto", () => {
    expect(findClient([cliente({})], "")).toBeUndefined();
    expect(findClient([cliente({ patente: "ABCD12" })], "abcd12")?.patente).toBe("ABCD12");
  });
});

describe("rechazoClienteSinPatente", () => {
  it("pide teléfono o correo", () => {
    expect(rechazoClienteSinPatente({})).not.toBeNull();
    expect(rechazoClienteSinPatente({ telefono: "+569" })).not.toBeNull();
    expect(rechazoClienteSinPatente({ telefono: "+56912345678" })).toBeNull();
    expect(rechazoClienteSinPatente({ email: "ana@correo.cl" })).toBeNull();
  });
  it("no admite plan", () => {
    expect(rechazoClienteSinPatente({ email: "ana@correo.cl", plan: "Plan X5" })).not.toBeNull();
    expect(rechazoClienteSinPatente({ email: "ana@correo.cl", vencimiento: "2026-12-01T00:00:00.000Z" })).not.toBeNull();
  });
});

describe("validarClienteModal sin patente", () => {
  const base: DatosValidacionClienteModal = {
    nombreRaw: "Ana",
    patenteRaw: "",
    telefonoRaw: "+56912345678",
    vehiculoRaw: "",
    emailRaw: "",
    tipoDocumento: "Boleta",
    razonSocialRaw: "",
    rutRaw: "",
    direccionRaw: "",
    giroRaw: "",
    exentoFormato: false,
    clientes: [cliente({ id: "otro" })],
    clienteIdActual: undefined,
  };

  it("fuera del POS la patente sigue siendo obligatoria", () => {
    expect(validarClienteModal(base).ok).toBe(false);
  });
  it("en el POS basta nombre y teléfono, aunque ya haya otro sin auto", () => {
    expect(validarClienteModal({ ...base, permitirSinPatente: true })).toMatchObject({ ok: true, patente: "" });
  });
  it("en el POS sin teléfono ni correo no pasa", () => {
    expect(validarClienteModal({ ...base, telefonoRaw: "+569", permitirSinPatente: true }).ok).toBe(false);
  });
  it("si trae patente, se valida como siempre", () => {
    expect(validarClienteModal({ ...base, patenteRaw: "XX", permitirSinPatente: true }).ok).toBe(false);
  });
});

describe("cuponesVigentesDeCliente sin patente", () => {
  it("no se adueña de los códigos abiertos", () => {
    const abierto: Cupon = {
      id: "k1",
      codigo: "ABIERTO",
      nombreLote: "Promo",
      valor: 2000,
      numeroLote: 1,
      totalLote: 1,
      fechaCaducidad: "2999-01-01T00:00:00.000Z",
      usado: false,
      creadoEn: "2026-10-01T00:00:00.000Z",
      tipo: "descuento",
    };
    expect(cuponesVigentesDeCliente([abierto, { ...abierto, id: "k2", codigo: "VALE", tipo: "vale" }], cliente({}))).toEqual([]);
  });
});
