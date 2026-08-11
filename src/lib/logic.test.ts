import { describe, expect, it } from "vitest";
import {
  eliminarIngreso,
  empresasFaltantesDesdeClientes,
  importarCartola,
  importarClientes,
  registrarIngreso,
  registrarIngresoDetailing,
  registrarIngresoLavadoWeb,
  renovarPlan,
} from "./logic";
import { CONFIG_DEFAULT, PRECIOS_DEFAULT } from "./helpers";
import type { ParsedMovimiento } from "./cartolaParser";
import type { AppData, Cita, Cliente, Ingreso, Venta } from "@/types";

function appDataVacia(): AppData {
  return {
    clientes: [],
    ingresos: [],
    ventas: [],
    precios: PRECIOS_DEFAULT,
    preciosTamano: {},
    perfiles: [],
    cupones: [],
    movimientosContables: [],
    categoriasGasto: [],
    categoriasIngreso: [],
    categoriasProducto: [],
    empresas: [],
    servicios: [],
    horariosAgenda: [],
    bloqueosAgenda: [],
    citas: [],
    config: CONFIG_DEFAULT,
    cartolaMovimientos: [],
    reglasConciliacion: [],
    proveedores: [],
    productos: [],
    insumos: [],
    categoriasInsumo: [],
    destinosInventario: [],
    movimientosInventario: [],
    maquinarias: [],
    registrosMantencion: [],
    alertasMantencion: [],
    plantillasCorreo: [],
    plantillasWhatsapp: [],
    reglasWhatsapp: [],
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

function ingresoBase(overrides: Partial<Ingreso> = {}): Ingreso {
  return {
    id: "i1",
    clienteId: "c1",
    patente: "AB1234",
    nombre: "JUAN PEREZ",
    fecha: new Date().toISOString(),
    planEstadoAlIngreso: "ok",
    ...overrides,
  };
}

describe("eliminarIngreso", () => {
  it("saca el ingreso de la lista y resta una visita al cliente", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 3 });
    const ingreso = ingresoBase();
    data.clientes = [cliente];
    data.ingresos = [ingreso];

    const patch = eliminarIngreso(data, ingreso);

    expect(patch.ingresos).toHaveLength(0);
    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(2);
    expect(clienteActualizado.ultimaVisita).toBeUndefined();
  });

  it("no deja visitas negativas si el contador ya estaba en 0", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 0 });
    const ingreso = ingresoBase();
    data.clientes = [cliente];
    data.ingresos = [ingreso];

    const patch = eliminarIngreso(data, ingreso);

    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(0);
  });

  it("recalcula ultimaVisita a partir de los ingresos que quedan, no la deja en la fecha del ingreso borrado", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 2 });
    const anterior = ingresoBase({ id: "i-anterior", fecha: "2026-01-01T10:00:00.000Z" });
    const masReciente = ingresoBase({ id: "i-reciente", fecha: "2026-01-05T10:00:00.000Z" });
    data.clientes = [cliente];
    data.ingresos = [masReciente, anterior];

    const patch = eliminarIngreso(data, masReciente);

    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(1);
    expect(clienteActualizado.ultimaVisita).toBe(anterior.fecha);
  });

  it("borra también la venta de Lavado único cobrada junto con el ingreso (cobrarLavadoUnico)", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const ingreso = ingresoBase({ fecha: "2026-01-05T10:00:00.000Z" });
    const venta: Venta = {
      id: "v1",
      clienteId: cliente.id,
      patente: cliente.patente,
      nombre: cliente.nombre,
      plan: "",
      precio: 9990,
      tipo: "Lavado único",
      fecha: "2026-01-05T10:00:00.200Z",
    };
    data.clientes = [cliente];
    data.ingresos = [ingreso];
    data.ventas = [venta];

    const patch = eliminarIngreso(data, ingreso);

    expect(patch.ventas).toHaveLength(0);
  });

  it("no borra ventas de otro tipo (plan/renovación) ni de otro cliente", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const ingreso = ingresoBase({ fecha: "2026-01-05T10:00:00.000Z" });
    const ventaPlan: Venta = {
      id: "v-plan",
      clienteId: cliente.id,
      patente: cliente.patente,
      nombre: cliente.nombre,
      plan: "Plan Ilimitado Mensual",
      precio: 21990,
      tipo: "Plan nuevo",
      fecha: ingreso.fecha,
    };
    data.clientes = [cliente];
    data.ingresos = [ingreso];
    data.ventas = [ventaPlan];

    const patch = eliminarIngreso(data, ingreso);

    expect(patch.ventas).toBeUndefined();
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

  it("permite una segunda pasada por el túnel para la misma cita", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const cita = citaDetailingBase({ estado: "listo_entrega" });
    data.clientes = [cliente];
    data.citas = [cita];
    data.ingresos = [
      {
        id: "i-ya-registrado",
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        fecha: new Date().toISOString(),
        planEstadoAlIngreso: "ok",
        glosa: "Servicio de Detailing",
        citaId: cita.id,
      },
    ];

    const patch = registrarIngresoDetailing(data, cliente, cita, "Operador X");

    expect(patch.ingresos).toHaveLength(2);
    expect(patch.ingresos![0].citaId).toBe(cita.id);
    expect(patch.ventas).toBeUndefined();
  });

  it("no permite una tercera pasada ni toca la cita una vez alcanzado el máximo de 2", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const cita = citaDetailingBase({ estado: "listo_entrega" });
    data.clientes = [cliente];
    data.citas = [cita];
    data.ingresos = [
      {
        id: "i-pasada-1",
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        fecha: new Date().toISOString(),
        planEstadoAlIngreso: "ok",
        glosa: "Servicio de Detailing",
        citaId: cita.id,
      },
      {
        id: "i-pasada-2",
        clienteId: cliente.id,
        patente: cliente.patente,
        nombre: cliente.nombre,
        fecha: new Date().toISOString(),
        planEstadoAlIngreso: "ok",
        glosa: "Servicio de Detailing",
        citaId: cita.id,
      },
    ];

    const patch = registrarIngresoDetailing(data, cliente, cita, "Operador X");

    expect(patch).toEqual({});
  });

  it("no retrocede el estado de la cita si ya avanzó más allá de 'en_limpieza' (p. ej. listo_entrega)", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const cita = citaDetailingBase({ estado: "listo_entrega" });
    data.clientes = [cliente];
    data.citas = [cita];

    const patch = registrarIngresoDetailing(data, cliente, cita, "Operador X");

    const citaActualizada = patch.citas!.find((c) => c.id === cita.id)!;
    expect(citaActualizada.estado).toBe("listo_entrega");
  });
});

describe("registrarIngresoLavadoWeb", () => {
  function ventaLavadoWebBase(overrides: Partial<Venta> = {}): Venta {
    return {
      id: "v-web-1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "JUAN PEREZ",
      plan: "",
      precio: 9990,
      tipo: "Lavado único (Web)",
      fecha: "2026-01-05T10:00:00.000Z",
      ...overrides,
    };
  }

  it("deja el ingreso con glosa 'Lavado pagado online', sin crear una venta nueva, y marca la venta como canjeada", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ visitas: 1 });
    const venta = ventaLavadoWebBase();
    data.clientes = [cliente];
    data.ventas = [venta];

    const patch = registrarIngresoLavadoWeb(data, cliente, venta, "Operador X");

    expect(patch.ingresos).toHaveLength(1);
    expect(patch.ingresos![0].glosa).toBe("Lavado pagado online");
    const clienteActualizado = patch.clientes!.find((c) => c.id === cliente.id)!;
    expect(clienteActualizado.visitas).toBe(2);
    expect(patch.ventas).toHaveLength(1);
    expect(patch.ventas![0].canjeadaEn).toBeTruthy();
    // No es una venta nueva: mismo id, mismo precio, solo se agregó canjeadaEn.
    expect(patch.ventas![0].id).toBe(venta.id);
    expect(patch.ventas![0].precio).toBe(venta.precio);
  });
});

describe("renovarPlan", () => {
  it("si el plan está vigente, extiende 30 días desde el vencimiento actual (no desde hoy)", () => {
    const data = appDataVacia();
    const vencimientoActual = new Date();
    vencimientoActual.setDate(vencimientoActual.getDate() + 10);
    const cliente = clienteBase({ vencimiento: vencimientoActual.toISOString() });
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X", PRECIOS_DEFAULT["Plan Ilimitado Mensual"].promo);

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

    const patch = renovarPlan(data, cliente, "Operador X", PRECIOS_DEFAULT["Plan Ilimitado Mensual"].promo);

    const nuevoVencimiento = new Date(patch.clientes!.find((c) => c.id === cliente.id)!.vencimiento!);
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 30);
    expect(nuevoVencimiento.toDateString()).toBe(esperado.toDateString());
  });

  it("registra la venta con el precio recibido", () => {
    const data = appDataVacia();
    const cliente = clienteBase();
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X", 16990);

    expect(patch.ventas).toHaveLength(1);
    expect(patch.ventas![0].precio).toBe(16990);
    expect(patch.ventas![0].tipo).toBe("Renovación preferencial");
  });

  it("acepta un tipo de venta explícito (ej: reactivación promocional)", () => {
    const data = appDataVacia();
    const cliente = clienteBase({ vencimiento: "2000-01-01T00:00:00.000Z" });
    data.clientes = [cliente];

    const patch = renovarPlan(data, cliente, "Operador X", 15990, undefined, "Reactivación promocional");

    expect(patch.ventas![0].tipo).toBe("Reactivación promocional");
    expect(patch.ventas![0].precio).toBe(15990);
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

  it("da de alta la Empresa cuando una fila trae Factura con un RUT nuevo", () => {
    const data = appDataVacia();
    const rows = [
      {
        patente: "ab1234",
        nombre: "maria lopez",
        "tipo documento": "Factura",
        "razon social": "Comercial Lopez SpA",
        rut: "12345678-9",
        direccion: "Av. Siempre Viva 123",
        giro: "Comercio",
      },
    ];

    const resultado = importarClientes(data, rows);

    expect(resultado.patch.empresas).toHaveLength(1);
    expect(resultado.patch.empresas![0].razonSocial).toBe("Comercial Lopez SpA");
    expect(resultado.patch.empresas![0].contactoClienteId).toBe(resultado.patch.clientes![0].id);
  });

  it("no duplica la Empresa si el RUT ya está registrado", () => {
    const data = appDataVacia();
    data.empresas = [
      {
        id: "e1",
        razonSocial: "Ya Existe SpA",
        rut: "12.345.678-9",
        creadoEn: new Date().toISOString(),
      },
    ];
    const rows = [
      {
        patente: "ab1234",
        nombre: "maria lopez",
        "tipo documento": "Factura",
        "razon social": "Otro nombre",
        rut: "12345678-9",
        direccion: "Av. Siempre Viva 123",
        giro: "Comercio",
      },
    ];

    const resultado = importarClientes(data, rows);

    expect(resultado.patch.empresas).toBeUndefined();
  });

  it("marca como error una fila Factura sin Razón Social/RUT/Dirección/Giro completos", () => {
    const data = appDataVacia();
    const rows = [
      { patente: "ab1234", nombre: "maria lopez", "tipo documento": "Factura", "razon social": "Comercial Lopez SpA" },
    ];

    const resultado = importarClientes(data, rows);

    expect(resultado.errores).toEqual([2]);
    expect(resultado.patch.clientes).toHaveLength(0);
    expect(resultado.nuevos).toBe(0);
  });
});

describe("empresasFaltantesDesdeClientes", () => {
  it("encuentra clientes con Factura que no tienen Empresa y los agrupa por RUT único", () => {
    const data = appDataVacia();
    data.clientes = [
      clienteBase({ id: "c1", patente: "AB1234", tipoDocumento: "Factura", rut: "12.345.678-9", razonSocial: "Empresa Uno" }),
      clienteBase({ id: "c2", patente: "CD5678", tipoDocumento: "Factura", rut: "12345678-9", razonSocial: "Empresa Uno" }),
      clienteBase({ id: "c3", patente: "EF9012", tipoDocumento: "Boleta" }),
    ];

    const faltantes = empresasFaltantesDesdeClientes(data);

    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].contactoClienteId).toBe("c1");
  });

  it("no repite empresas que ya existen", () => {
    const data = appDataVacia();
    data.empresas = [{ id: "e1", razonSocial: "Empresa Uno", rut: "12.345.678-9", creadoEn: new Date().toISOString() }];
    data.clientes = [clienteBase({ id: "c1", tipoDocumento: "Factura", rut: "12345678-9", razonSocial: "Empresa Uno" })];

    const faltantes = empresasFaltantesDesdeClientes(data);

    expect(faltantes).toHaveLength(0);
  });
});

function movimientoParseado(overrides: Partial<ParsedMovimiento> = {}): ParsedMovimiento {
  return {
    fecha: "2026-06-01T12:00:00.000Z",
    glosa: "Abono Ventas GETNET 30/05/26 CIERR",
    cargo: 0,
    abono: 1066944,
    saldo: 11007059,
    numeroDocumento: "88545256",
    sucursal: "TEMUCO PZA EXPRESSO",
    ...overrides,
  };
}

describe("importarCartola", () => {
  it("importa movimientos nuevos y aplica la regla semilla de GETNET", () => {
    const data = appDataVacia();

    const resultado = importarCartola(data, [movimientoParseado()], "santander_empresa");

    expect(resultado.nuevos).toBe(1);
    expect(resultado.duplicados).toBe(0);
    expect(resultado.patch.reglasConciliacion).toEqual([
      expect.objectContaining({ id: "GETNET", categoria: "Ingreso Tarjeta POS (GETNET)" }),
    ]);
    expect(resultado.patch.cartolaMovimientos?.[0]).toMatchObject({
      cuenta: "santander_empresa",
      abono: 1066944,
      categoria: "Ingreso Tarjeta POS (GETNET)",
      estado: "pendiente",
    });
  });

  it("no duplica un movimiento ya importado al volver a subir la misma cartola", () => {
    const data = appDataVacia();
    const primera = importarCartola(data, [movimientoParseado()], "santander_empresa");
    data.cartolaMovimientos = primera.patch.cartolaMovimientos!;
    data.reglasConciliacion = primera.patch.reglasConciliacion!;

    const segunda = importarCartola(data, [movimientoParseado()], "santander_empresa");

    expect(segunda.nuevos).toBe(0);
    expect(segunda.duplicados).toBe(1);
    expect(segunda.patch.cartolaMovimientos).toBeUndefined();
  });

  it("no clasifica una glosa sin regla conocida", () => {
    const data = appDataVacia();

    const resultado = importarCartola(
      data,
      [movimientoParseado({ glosa: "086906100K PAGO PROVEEDOR ARRENDA", cargo: 341019, abono: 0 })],
      "santander_empresa"
    );

    expect(resultado.patch.cartolaMovimientos?.[0].categoria).toBeUndefined();
  });
});
