import { describe, expect, it } from "vitest";
import { importarClientes, registrarIngreso, registrarIngresoDetailing, renovarPlan } from "./actions";
import { CONFIG_DEFAULT, PRECIOS_DEFAULT } from "./helpers";
import type { AppData, Cita, Cliente } from "@/types";

function appDataVacia(): AppData {
  return {
    clientes: [],
    ingresos: [],
    ventas: [],
    precios: PRECIOS_DEFAULT,
    perfiles: [],
    cupones: [],
    movimientosContables: [],
    categoriasGasto: [],
    empresas: [],
    servicios: [],
    horariosAgenda: [],
    bloqueosAgenda: [],
    citas: [],
    config: CONFIG_DEFAULT,
  };
}

function clienteBase(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: "c1",
    nombre: "JUAN PEREZ",
    patente: "AB1234",
    plan: "Plan Ilimitado Mensual",
    visitas: 0,
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

describe("registrarIngreso", () => {
  it("agrega el ingreso al principio de la lista y suma una visita al cliente", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 2 });
    data.clientes = [cliente];

    const patch = registrarIngreso(data, cliente, "Operador X");

    expect(patch.ingresos).toHaveLength(1);
    expect(patch.ingresos![0].clienteId).toBe(cliente.id);
    expect(patch.ingresos![0].creadoPor).toBe("Operador X");
    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(3);
  });

  it("marca esGarantia y glosa cuando corresponde", () => {
    const data = appDataVacia();
    const cliente = clienteBase();
    data.clientes = [cliente];

    const patch = registrarIngreso(data, cliente, null, true, "Reclamo");

    expect(patch.ingresos![0].esGarantia).toBe(true);
    expect(patch.ingresos![0].glosa).toBe("Reclamo");
  });
});

function citaDetailingBase(overrides: Partial<Cita> = {}): Cita {
  return {
    id: "cita1",
    clienteId: "c1",
    servicioIds: ["detailing-pequeno"],
    patente: "AB1234",
    nombre: "JUAN PEREZ",
    fechaHora: new Date().toISOString(),
    duracionMinutos: 30,
    estado: "recibido",
    origen: "interno",
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

describe("registrarIngresoDetailing", () => {
  it("deja el ingreso con glosa 'Servicio de Detailing' ligado a la cita, sin crear una venta nueva", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const cita = citaDetailingBase();
    data.clientes = [cliente];
    data.citas = [cita];

    const patch = registrarIngresoDetailing(data, cliente, cita, "Operador X");

    expect(patch.ingresos).toHaveLength(1);
    expect(patch.ingresos![0].glosa).toBe("Servicio de Detailing");
    expect(patch.ingresos![0].citaId).toBe(cita.id);
    expect(patch.ventas).toBeUndefined();
    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(2);
    const citaActualizada = patch.citas!.find((c) => c.id === cita.id)!;
    expect(citaActualizada.estado).toBe("en_limpieza");
  });
});

describe("renovarPlan", () => {
  it("si el plan está vigente, extiende 30 días desde el vencimiento actual (no desde hoy)", () => {
    const data = appDataVacia();
    const vencimientoActual = new Date();
    vencimientoActual.setDate(vencimientoActual.getDate() + 10);
    const cliente = clienteBase({ vencimiento: vencimientoActual.toISOString() });
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X");

    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    const nuevoVencimiento = new Date(clienteActualizado.vencimiento!);
    const esperado = new Date(vencimientoActual);
    esperado.setDate(esperado.getDate() + 30);
    expect(nuevoVencimiento.toDateString()).toBe(esperado.toDateString());
  });

  it("si el plan está vencido, cuenta los 30 días desde hoy", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ vencimiento: "2000-01-01T00:00:00.000Z" });
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X");

    const nuevoVencimiento = new Date(patch.clientes!.find((c) => c.id === cliente.id)!.vencimiento!);
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 30);
    expect(nuevoVencimiento.toDateString()).toBe(esperado.toDateString());
  });

  it("registra la venta con el precio preferencial del plan del cliente", () => {
    const data = appDataVacia();
    const cliente = clienteBase();
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X");

    expect(patch.ventas).toHaveLength(1);
    expect(patch.ventas![0].precio).toBe(PRECIOS_DEFAULT["Plan Ilimitado Mensual"].promo);
    expect(patch.ventas![0].tipo).toBe("Renovación preferencial");
  });
});

describe("importarClientes", () => {
  it("crea clientes nuevos a partir de filas válidas", () => {
    const data = appDataVacia();
    const rows = [{ patente: "ab1234", nombre: "maria lopez", telefono: "912345678" }];

    const resultado = importarClientes(data, rows);

    expect(resultado.nuevos).toBe(1);
    expect(resultado.actualizados).toBe(0);
    expect(resultado.errores).toHaveLength(0);
    const [cliente] = resultado.patch.clientes!;
    expect(cliente.patente).toBe("AB1234");
    expect(cliente.nombre).toBe("MARIA LOPEZ");
    expect(cliente.telefono).toBe("+56912345678");
  });

  it("actualiza un cliente existente en vez de duplicarlo cuando la patente ya existe", () => {
    const data = appDataVacia();
    data.clientes = [clienteBase({ patente: "AB1234", nombre: "NOMBRE VIEJO" })];
    const rows = [{ patente: "AB1234", nombre: "nombre nuevo" }];

    const resultado = importarClientes(data, rows);

    expect(resultado.nuevos).toBe(0);
    expect(resultado.actualizados).toBe(1);
    expect(resultado.patch.clientes).toHaveLength(1);
    expect(resultado.patch.clientes![0].nombre).toBe("NOMBRE NUEVO");
  });

  it("marca como error (fila + 2, por el header y el índice base-1 de Excel) las patentes inválidas", () => {
    const data = appDataVacia();
    const rows = [{ patente: "123", nombre: "x" }];

    const resultado = importarClientes(data, rows);

    expect(resultado.errores).toEqual([2]);
    expect(resultado.patch.clientes).toHaveLength(0);
  });
});
