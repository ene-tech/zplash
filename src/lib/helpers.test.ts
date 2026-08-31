import { describe, expect, it } from "vitest";
import {
  alertaMantencionStatus,
  mantencionStatus,
  planMantencionStatus,
  buscarProveedorPorRut,
  calcularOfertasPlan,
  PLAN_X5,
  PLAN_ILIMITADO_LEGACY,
  pasesIncluidos,
  pasesRestantes,
  planVigente,
  ilimitadoHastaAlRenovar,
  CATEGORIA_DETAILING,
  CONFIG_DEFAULT,
  cuponDelLoteUsadoPorPatente,
  dentroDeHorarioOperador,
  diasVencido,
  esExentoBloqueoReingreso,
  esExentoFormatoCliente,
  esExentoHorarioOperador,
  esExentoValidacionRegistroOperador,
  esCorreoDeRelleno,
  esEmailEnviable,
  esFinDeSemanaOFestivo,
  esServicioTunelLibre,
  esTarjetaWeb,
  esAjusteCierre,
  esVentaAutomatica,
  esVentaNuevaWeb,
  fechaEfectiva,
  fmtCLP,
  LAVADO_ADICIONAL_KEY,
  LAVADO_UNICO_KEY,
  precioLavadoAdicional,
  precioLavadoUnico,
  PRECIO_LAVADO_ADICIONAL,
  PRECIO_LAVADO_UNICO,
  idAjusteCierre,
  resumenCierreTexto,
  formatRut,
  estadoReingresoPlan,
  fmtHora,
  fmtTelefono,
  formatTelefono,
  finCicloPlan,
  periodoPlan,
  isValidPatente,
  isValidRut,
  isValidTelefono,

  telefonoTipeado,
  keyPrimeraContratacion,
  mensajeBloqueoReingreso,
  mesesEntre,
  mesKey,
  montoDescuento,
  normPlate,
  ordenarPerfiles,
  patchDeCliente,
  planStatus,
  promoPrimerCobroOneclick,
  precioContratacion,
  precioPagoAtrasado,
  precioRenovacionCliente,
  precioReactivacionVencido,
  proximoIngresoPermitido,
  puedeBorrarCategoriaInventario,
  puedeBorrarIngreso,
  soloCambiosSinPlata,
  beneficioCupon,
  cuponDescuentoDePatente,
  ofertaConCupon,
  precioConCupon,
  marcarDescuentoUsado,
  resolverDescuento,
  resolverPatentePendiente,
  sumarMeses,
  sumarMesesFecha,
  vencimientoAnclado,
  ventaLavadoUnicoDeIngreso,
  ventaLavadoWebPendiente,
  variacionPorcentual,
  ventaUpgradeElegible,
  visitasDesdeContratacion,
  visitasPeriodoPlan,
  visitasUltimos30Dias,
  visitasUltimoPeriodoVencido,
} from "./helpers";
import type { Cliente, ConfigGlobal, Cupon, Ingreso, PerfilPublico, Precios, Venta } from "@/types";

describe("normPlate", () => {
  it("pasa a mayúsculas y saca todo lo que no sea letra/número", () => {
    expect(normPlate("ab-1234")).toBe("AB1234");
    expect(normPlate(" ab.cd.12 ")).toBe("ABCD12");
  });

  it("devuelve string vacío para null/undefined", () => {
    expect(normPlate(null)).toBe("");
    expect(normPlate(undefined)).toBe("");
  });
});

describe("isValidPatente", () => {
  it("acepta formato antiguo (2 letras + 4 números)", () => {
    expect(isValidPatente("AB1234")).toBe(true);
  });

  it("acepta formato nuevo (4 letras + 2 números)", () => {
    expect(isValidPatente("ABCD12")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidPatente("ABC123")).toBe(false);
    expect(isValidPatente("")).toBe(false);
    expect(isValidPatente(null)).toBe(false);
  });
});

describe("formatRut / isValidRut", () => {
  it("agrega puntos de miles y separa el dígito verificador con guion", () => {
    expect(formatRut("123456789")).toBe("12.345.678-9");
  });

  it("acepta 'k' minúscula como dígito verificador y la normaliza a mayúscula", () => {
    expect(formatRut("12345678k")).toBe("12.345.678-K");
  });

  it("valida ruts bien formados y rechaza el resto", () => {
    expect(isValidRut("12.345.678-9")).toBe(true);
    expect(isValidRut("123456789")).toBe(true);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut(null)).toBe(false);
  });
});

describe("formatTelefono / isValidTelefono", () => {
  it("normaliza las variantes comunes de celular chileno a +569XXXXXXXX", () => {
    expect(formatTelefono("+56 9 1234 5678")).toBe("+56912345678");
    expect(formatTelefono("912345678")).toBe("+56912345678");
    expect(formatTelefono("12345678")).toBe("+56912345678");
  });

  it("descarta un 0 inicial antes de evaluar el patrón", () => {
    expect(formatTelefono("0912345678")).toBe("+56912345678");
  });

  it("devuelve el original si no calza con ningún patrón conocido", () => {
    expect(formatTelefono("221234567")).toBe("221234567");
  });

  it("el teléfono vacío es válido (es opcional) pero uno mal formado no", () => {
    expect(isValidTelefono("")).toBe(true);
    expect(isValidTelefono(null)).toBe(true);
    expect(isValidTelefono("221234567")).toBe(false);
    expect(isValidTelefono("+56912345678")).toBe(true);
  });
});

describe("telefonoTipeado", () => {
  // El input precarga "+569": si el operador no escribió nada más, no hay
  // teléfono. Guardarlo como si lo hubiera dejó 358 fichas con "+569" en julio
  // de 2026.
  it("descarta el prefijo precargado sin dígitos", () => {
    expect(telefonoTipeado("+569")).toBe("");
    expect(telefonoTipeado("+56")).toBe("");
    expect(telefonoTipeado("  +569  ")).toBe("");
    expect(telefonoTipeado("")).toBe("");
  });

  it("deja pasar cualquier cosa que traiga dígitos propios", () => {
    expect(telefonoTipeado("+56968285363")).toBe("+56968285363");
    expect(telefonoTipeado("+569 6828 5363")).toBe("+569 6828 5363");
    expect(telefonoTipeado("68285363")).toBe("68285363");
  });
});

describe("esCorreoDeRelleno", () => {
  it("agarra las direcciones que se inventan para saltarse el campo", () => {
    expect(esCorreoDeRelleno("noquieredarcorreo@gmail.com")).toBe(true);
    expect(esCorreoDeRelleno("noquiere@darcorreo.gmsil.com")).toBe(true);
    expect(esCorreoDeRelleno("invitado.cl@gmail.com")).toBe(true);
    expect(esCorreoDeRelleno("notienw@gmail.com")).toBe(true); // con tipeo
    expect(esCorreoDeRelleno("recepcion@zplash.cl")).toBe(true); // casilla del local
  });

  it("no toca direcciones reales que contienen las mismas letras", () => {
    expect(esCorreoDeRelleno("juan.cortes@teleservise.cl")).toBe(false);
    expect(esCorreoDeRelleno("nadiela_bp@hotmail.com")).toBe(false);
    expect(esCorreoDeRelleno("bruno@mail.com")).toBe(false);
    expect(esCorreoDeRelleno("")).toBe(false);
  });
});

describe("esEmailEnviable", () => {
  // Las cuatro direcciones son fallas reales de Resend sacadas del log; las
  // tres últimas pasan isValidEmail sin problema, que es justo el motivo por
  // el que existe esta función aparte. Importa que sean exactas: de esto
  // depende que se le borre el correo a un cliente.
  it("rechaza las direcciones que el proveedor rebota siempre", () => {
    expect(esEmailEnviable("jorge sancheztemuco@gmail.com")).toBe(false); // espacio
    expect(esEmailEnviable("israelgutiérrezf1982@gmail.com")).toBe(false); // tilde
    expect(esEmailEnviable("cardenas.matias.nuños@gmail.com")).toBe(false); // ñ
    expect(esEmailEnviable("cliente.@gmail.com")).toBe(false); // punto al final de la parte local
  });

  it("acepta direcciones normales, incluidas las de forma poco común", () => {
    expect(esEmailEnviable("juan.perez@gmail.com")).toBe(true);
    expect(esEmailEnviable("juan+lavado@sub.dominio.cl")).toBe(true);
    expect(esEmailEnviable("  espacios.alrededor@gmail.com  ")).toBe(true);
    expect(esEmailEnviable("a_b-c'd@empresa.co.uk")).toBe(true);
  });

  it("trata el email ausente como no enviable, sin confundirlo con uno malo", () => {
    // El motor chequea `!cliente.email` antes, así que acá no se llega con
    // vacío — pero si se llegara, no debe explotar.
    expect(esEmailEnviable("")).toBe(false);
    expect(esEmailEnviable(null)).toBe(false);
    expect(esEmailEnviable(undefined)).toBe(false);
  });
});

describe("fmtTelefono", () => {
  it("agrega el formato visual +569 -XXXX XXXX a un celular ya normalizado", () => {
    expect(fmtTelefono("+56912345678")).toBe("+569 -1234 5678");
  });

  it("normaliza antes de formatear, aceptando las mismas variantes que formatTelefono", () => {
    expect(fmtTelefono("912345678")).toBe("+569 -1234 5678");
    expect(fmtTelefono("+56 9 1234 5678")).toBe("+569 -1234 5678");
  });

  it("devuelve vacío/original si no hay teléfono o no calza con el patrón chileno", () => {
    expect(fmtTelefono("")).toBe("");
    expect(fmtTelefono(null)).toBe("");
    expect(fmtTelefono("221234567")).toBe("221234567");
  });
});

describe("planStatus", () => {
  it("sin vencimiento -> Sin plan", () => {
    expect(planStatus({ vencimiento: null }).label).toBe("Sin plan");
  });

  it("vencimiento pasado -> Vencido", () => {
    expect(planStatus({ vencimiento: "2000-01-01" }).label).toBe("Vencido");
  });

  it("vencimiento dentro de los próximos 7 días -> Por vencer", () => {
    const enTresDias = new Date();
    enTresDias.setDate(enTresDias.getDate() + 3);
    expect(planStatus({ vencimiento: enTresDias.toISOString() }).label).toBe("Por vencer");
  });

  it("vencimiento lejano -> Vigente", () => {
    const enUnMes = new Date();
    enUnMes.setDate(enUnMes.getDate() + 40);
    expect(planStatus({ vencimiento: enUnMes.toISOString() }).label).toBe("Vigente");
  });
});

describe("sumarMeses", () => {
  it("suma meses respetando el día", () => {
    expect(sumarMeses("2026-01-15", 8)).toBe("2026-09-15");
  });

  it("cruza de año", () => {
    expect(sumarMeses("2026-11-01", 3)).toBe("2027-02-01");
  });
});

describe("planMantencionStatus", () => {
  const AHORA = new Date("2026-08-18T12:00:00.000Z");
  const base = {
    id: "p1",
    maquinariaId: "m1",
    descripcion: "Cambio de escobillas",
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
  };
  const ingresos = (n: number, fecha = "2026-06-01T00:00:00.000Z") => Array.from({ length: n }, () => ({ fecha }));

  it("por fecha: usa la anticipación de la tarea, no el default de 7 días", () => {
    // Última vez el 2026-01-01 + 240 días = 2026-08-29, faltan 11 días.
    const plan = { ...base, periodicidadTipo: "fecha" as const, intervaloDias: 240 };
    expect(planMantencionStatus(plan, [], [], AHORA)!.label).toBe("Al día");
    expect(planMantencionStatus({ ...plan, avisoDias: 15 }, [], [], AHORA)!.label).toBe("Por vencer");
  });

  it("por fecha: vencida cuando pasó el intervalo", () => {
    const plan = { ...base, periodicidadTipo: "fecha" as const, intervaloDias: 30 };
    expect(planMantencionStatus(plan, [], [], AHORA)!.label).toBe("Vencida");
  });

  it("por lavados: cuenta los ingresos posteriores a la última vez que se hizo ESTA tarea", () => {
    const plan = { ...base, periodicidadTipo: "conteo" as const, intervaloLavados: 100, avisoLavados: 20 };
    expect(planMantencionStatus(plan, [], ingresos(50), AHORA)!.label).toBe("Al día");
    expect(planMantencionStatus(plan, [], ingresos(85), AHORA)!.label).toBe("Por vencer");
    expect(planMantencionStatus(plan, [], ingresos(100), AHORA)!.label).toBe("Vencida");
  });

  it("un registro de otra tarea no reinicia el contador", () => {
    const plan = { ...base, periodicidadTipo: "conteo" as const, intervaloLavados: 100 };
    const registro = {
      id: "r1",
      maquinariaId: "m1",
      planId: "otro-plan",
      fecha: "2026-07-01T00:00:00.000Z",
      descripcion: "otra cosa",
      vehiculosDesdeUltima: 0,
    };
    expect(planMantencionStatus(plan, [registro], ingresos(120), AHORA)!.label).toBe("Vencida");
    expect(planMantencionStatus(plan, [{ ...registro, planId: "p1" }], ingresos(120), AHORA)!.label).toBe("Al día");
  });

  it("arranque con la máquina ya andando: lavadosPrevios cuenta como acumulado", () => {
    const plan = { ...base, periodicidadTipo: "conteo" as const, intervaloLavados: 10000, avisoLavados: 500 };
    expect(planMantencionStatus({ ...plan, lavadosPrevios: 8000 }, [], [], AHORA)!.conteoActual).toBe(8000);
    expect(planMantencionStatus({ ...plan, lavadosPrevios: 8000 }, [], [], AHORA)!.label).toBe("Al día");
    expect(planMantencionStatus({ ...plan, lavadosPrevios: 9600 }, [], [], AHORA)!.label).toBe("Por vencer");
    // los previos se suman a los lavados posteriores, no los reemplazan
    expect(planMantencionStatus({ ...plan, lavadosPrevios: 9000 }, [], ingresos(1200), AHORA)!.label).toBe("Vencida");
  });

  it("arranque: ultimaVezEn ancla el cálculo por fecha", () => {
    const plan = { ...base, periodicidadTipo: "fecha" as const, intervaloDias: 90 };
    // creadoEn es 2026-01-01 (vencida a la fecha del test); declarar que se
    // hizo el 2026-08-01 la deja al día.
    expect(planMantencionStatus(plan, [], [], AHORA)!.label).toBe("Vencida");
    expect(planMantencionStatus({ ...plan, ultimaVezEn: "2026-08-01" }, [], [], AHORA)!.label).toBe("Al día");
  });

  it("arranque: la primera mantención registrada deja sin efecto el punto de partida", () => {
    const plan = { ...base, periodicidadTipo: "conteo" as const, intervaloLavados: 10000, lavadosPrevios: 9900 };
    const registro = {
      id: "r1",
      maquinariaId: "m1",
      planId: "p1",
      fecha: "2026-07-01T00:00:00.000Z",
      descripcion: "hecha",
      vehiculosDesdeUltima: 0,
    };
    expect(planMantencionStatus(plan, [], [], AHORA)!.label).toBe("Por vencer");
    expect(planMantencionStatus(plan, [registro], [], AHORA)!.conteoActual).toBe(0);
  });

  it("mantencionStatus de la máquina = la tarea más urgente de su plan", () => {
    const alDia = { ...base, id: "p1", periodicidadTipo: "fecha" as const, intervaloDias: 240 };
    const vencida = { ...base, id: "p2", periodicidadTipo: "fecha" as const, intervaloDias: 10 };
    expect(mantencionStatus({ id: "m1" }, [alDia], [], [], AHORA)!.label).toBe("Al día");
    expect(mantencionStatus({ id: "m1" }, [alDia, vencida], [], [], AHORA)!.label).toBe("Vencida");
    expect(mantencionStatus({ id: "m1" }, [], [], [], AHORA)).toBeNull();
  });
});

describe("alertaMantencionStatus", () => {
  it("fechaObjetivo pasada -> Vencida", () => {
    expect(alertaMantencionStatus({ fechaObjetivo: "2000-01-01" }).label).toBe("Vencida");
  });

  it("fechaObjetivo dentro de los próximos 7 días -> Por vencer", () => {
    const enTresDias = new Date();
    enTresDias.setDate(enTresDias.getDate() + 3);
    expect(alertaMantencionStatus({ fechaObjetivo: enTresDias.toISOString() }).label).toBe("Por vencer");
  });

  it("fechaObjetivo lejana -> Programada", () => {
    const enUnMes = new Date();
    enUnMes.setDate(enUnMes.getDate() + 40);
    expect(alertaMantencionStatus({ fechaObjetivo: enUnMes.toISOString() }).label).toBe("Programada");
  });
});

describe("diasVencido", () => {
  it("sin vencimiento -> null", () => {
    expect(diasVencido({ vencimiento: null })).toBeNull();
  });

  it("plan vigente -> null", () => {
    const enUnMes = new Date();
    enUnMes.setDate(enUnMes.getDate() + 40);
    expect(diasVencido({ vencimiento: enUnMes.toISOString() })).toBeNull();
  });

  it("vencido hace 15 días -> 15", () => {
    const ahora = new Date();
    const hace15Dias = new Date(ahora);
    hace15Dias.setDate(hace15Dias.getDate() - 15);
    expect(diasVencido({ vencimiento: hace15Dias.toISOString() }, ahora)).toBe(15);
  });
});

describe("estadoReingresoPlan", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  const ahora = new Date("2026-01-02T10:00:00Z");

  it("libre si el cliente no tiene ingresos previos", () => {
    expect(estadoReingresoPlan([], "c1", ahora)).toBe("libre");
  });

  it("garantia si el último ingreso fue hace 1 hora o menos", () => {
    const haceMediaHora = new Date("2026-01-02T09:30:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", haceMediaHora)], "c1", ahora)).toBe("garantia");
  });

  it("bloqueado si el último ingreso fue hace más de 1 hora y menos de 24:30", () => {
    const haceVeinteHoras = new Date("2026-01-01T14:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", haceVeinteHoras)], "c1", ahora)).toBe("bloqueado");
  });

  it("libre si el último ingreso fue hace 24:30 horas o más", () => {
    const hace25Horas = new Date("2026-01-01T09:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", hace25Horas)], "c1", ahora)).toBe("libre");
  });

  it("ignora ingresos de otros clientes", () => {
    const haceUnaHora = new Date("2026-01-02T09:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("otro", haceUnaHora)], "c1", ahora)).toBe("libre");
  });

  it("respeta las horas de bloqueo configuradas en vez del default de 24:30", () => {
    const haceDosHoras = new Date("2026-01-02T08:00:00Z").toISOString();
    expect(estadoReingresoPlan([ingreso("c1", haceDosHoras)], "c1", ahora, 1)).toBe("libre");
    expect(estadoReingresoPlan([ingreso("c1", haceDosHoras)], "c1", ahora, 3)).toBe("bloqueado");
  });
});

describe("proximoIngresoPermitido / mensajeBloqueoReingreso", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("undefined si el cliente no tiene ingresos previos", () => {
    expect(proximoIngresoPermitido([], "c1")).toBeUndefined();
  });

  it("es el último ingreso + 24:30 horas", () => {
    const ultimo = ingreso("c1", "2026-01-01T10:00:00Z");
    const proximo = proximoIngresoPermitido([ultimo], "c1");
    expect(proximo?.toISOString()).toBe("2026-01-02T10:30:00.000Z");
  });

  it("el mensaje incluye la hora a partir de la cual puede reingresar", () => {
    const ultimo = ingreso("c1", "2026-01-01T10:00:00-03:00");
    const msg = mensajeBloqueoReingreso([ultimo], "c1");
    expect(msg).toContain("VEHICULO HIZO USO DEL SERVICIO TUNEL HACE MENOS DE 24:30 HORAS");
    expect(msg).toContain(fmtHora("2026-01-02T10:30:00-03:00"));
  });
});

describe("finCicloPlan", () => {
  it("contratado el 23, vence el 22 del mes siguiente", () => {
    expect(finCicloPlan(new Date(2026, 7, 23)).toDateString()).toBe(new Date(2026, 8, 22).toDateString());
  });

  it("contratado el 1, vence el último día del mes", () => {
    expect(finCicloPlan(new Date(2026, 1, 1)).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
  });

  it("contratado un 31, cae en el último día del mes corto sin desbordarse al siguiente", () => {
    expect(finCicloPlan(new Date(2026, 0, 31)).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
  });

  it("varios ciclos se cuentan desde la contratación, sin ir perdiendo días en los meses cortos", () => {
    // 31 ene: el ciclo 1 se recorta a febrero, pero el 2 vuelve al 30 de marzo.
    expect(finCicloPlan(new Date(2026, 0, 31), 2).toDateString()).toBe(new Date(2026, 2, 30).toDateString());
  });
});

describe("vencimientoAnclado", () => {
  it("mantiene el ciclo mensual anclado a la fecha de contratación original", () => {
    const contratacion = sumarMesesFecha(new Date(), -2);
    contratacion.setDate(contratacion.getDate() - 5); // 2 ciclos vencidos, dentro del 3ro
    const resultado = new Date(vencimientoAnclado(contratacion.toISOString()));
    expect(resultado.toDateString()).toBe(finCicloPlan(contratacion, 3).toDateString());
  });

  it("sin fecha de contratación, cuenta el mes desde hoy", () => {
    const resultado = new Date(vencimientoAnclado(null));
    expect(resultado.toDateString()).toBe(finCicloPlan(new Date()).toDateString());
  });
});

describe("periodoPlan", () => {
  // Las fechas esperadas se construyen locales (`new Date(2026, 5, 12)`) y no
  // con `new Date(iso).toDateString()`: el ancla del ciclo es el día de
  // calendario CHILENO de la fecha guardada (ver anclaCicloPlan/diaEnSantiago),
  // así que una expectativa que se corre con la TZ del runner deja de calzar.
  it("contratado el 12 de junio, el período vigente el 5 de julio es 12 jun - 11 jul", () => {
    const ahora = new Date("2026-07-05T12:00:00Z");
    const { inicio, fin } = periodoPlan({ fechaContratacion: "2026-06-12T15:00:00Z", vencimiento: null }, ahora);
    expect(inicio.toDateString()).toBe(new Date(2026, 5, 12).toDateString());
    // `fin` es exclusivo: el último día vigente es el anterior (11 de julio).
    expect(fin.toDateString()).toBe(new Date(2026, 6, 12).toDateString());
  });

  it("el día en que arranca el ciclo siguiente ya pertenece al período siguiente", () => {
    const ahora = new Date("2026-07-12T12:00:00Z");
    const { inicio } = periodoPlan({ fechaContratacion: "2026-06-12T15:00:00Z", vencimiento: null }, ahora);
    expect(inicio.toDateString()).toBe(new Date(2026, 6, 12).toDateString());
  });

  // Sin fechaContratacion (carga histórica) pero con plan vigente, el ciclo
  // se ancla al vencimiento: si no, la ventana móvil del último mes le
  // contaba pasadas del período anterior y el Operador le negaba el ingreso
  // incluido al cliente con plan (ver pasesRestantes).
  //
  // El ancla es el vencimiento MÁS UN DÍA: el vencimiento es el último día
  // vigente, no el borde del ciclo (ver finCicloPlan). Por eso la prueba es
  // de equivalencia contra el mismo cliente con fechaContratacion — un
  // desfase de un día acá le regala una pasada extra el día del vencimiento.
  it("sin fecha de contratación, se ancla al vencimiento y da el mismo ciclo", () => {
    const conContratacion = { fechaContratacion: "2026-06-12T15:00:00Z", vencimiento: "2026-07-11T15:00:00Z" };
    const sinContratacion = { fechaContratacion: null, vencimiento: "2026-07-11T15:00:00Z" };
    for (const dia of ["2026-06-12", "2026-07-05", "2026-07-11"]) {
      const ahora = new Date(`${dia}T15:00:00Z`);
      const esperado = periodoPlan(conContratacion, ahora);
      const obtenido = periodoPlan(sinContratacion, ahora);
      expect([obtenido.inicio.toDateString(), obtenido.fin.toDateString()]).toEqual([
        esperado.inicio.toDateString(),
        esperado.fin.toDateString(),
      ]);
    }
    // El día del vencimiento el plan sigue vigente: el ciclo todavía no rota.
    expect(periodoPlan(sinContratacion, new Date("2026-07-11T15:00:00Z")).fin.toDateString()).toBe(
      new Date(2026, 6, 12).toDateString()
    );
  });

  it("sin fecha de contratación ni vencimiento, usa una ventana del último mes", () => {
    const ahora = new Date("2026-07-05T12:00:00Z");
    const { inicio } = periodoPlan({ fechaContratacion: null, vencimiento: null }, ahora);
    const esperado = new Date(ahora);
    esperado.setHours(0, 0, 0, 0);
    expect(inicio.toDateString()).toBe(sumarMesesFecha(esperado, -1).toDateString());
  });
});

describe("visitasPeriodoPlan", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("cuenta solo los ingresos dentro del período de plan vigente, del cliente correcto", () => {
    const ahora = new Date("2026-07-05T12:00:00Z");
    const cliente = { id: "c1", fechaContratacion: "2026-06-12T00:00:00Z" };
    const ingresos = [
      ingreso("c1", "2026-06-12T09:00:00Z"), // dentro del período (primer día)
      ingreso("c1", "2026-06-30T09:00:00Z"), // dentro del período
      ingreso("c1", "2026-06-01T09:00:00Z"), // período anterior
      ingreso("c1", "2026-07-12T09:00:00Z"), // período siguiente
      ingreso("otro", "2026-06-20T09:00:00Z"), // otro cliente
    ];
    expect(visitasPeriodoPlan(ingresos, cliente, ahora)).toBe(2);
  });
});

describe("visitasUltimoPeriodoVencido", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("cuenta solo los ingresos de los 30 días antes de vencimiento, del cliente correcto", () => {
    const cliente = { id: "c1", vencimiento: "2026-07-12T00:00:00Z" };
    const ingresos = [
      ingreso("c1", "2026-06-12T09:00:00Z"), // dentro del período (primer día)
      ingreso("c1", "2026-06-30T09:00:00Z"), // dentro del período
      ingreso("c1", "2026-06-01T09:00:00Z"), // período anterior
      ingreso("c1", "2026-07-12T09:00:00Z"), // ya vencido, fuera del período
      ingreso("otro", "2026-06-20T09:00:00Z"), // otro cliente
    ];
    expect(visitasUltimoPeriodoVencido(ingresos, cliente)).toBe(2);
  });

  it("sin vencimiento -> 0", () => {
    expect(visitasUltimoPeriodoVencido([ingreso("c1", "2026-06-12T09:00:00Z")], { id: "c1", vencimiento: null })).toBe(0);
  });
});

describe("visitasDesdeContratacion", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("cuenta todos los ingresos desde fechaContratacion, sin acotar a 30 días", () => {
    const cliente = { id: "c1", fechaContratacion: "2026-06-12T00:00:00Z" };
    const ingresos = [
      ingreso("c1", "2026-06-12T09:00:00Z"), // dentro, primer día
      ingreso("c1", "2026-07-20T09:00:00Z"), // dentro, más allá de un ciclo de 30 días
      ingreso("c1", "2026-06-01T09:00:00Z"), // antes de contratar
      ingreso("otro", "2026-06-20T09:00:00Z"), // otro cliente
    ];
    expect(visitasDesdeContratacion(ingresos, cliente)).toBe(2);
  });

  it("sin fechaContratacion -> 0", () => {
    expect(visitasDesdeContratacion([ingreso("c1", "2026-06-12T09:00:00Z")], { id: "c1", fechaContratacion: null })).toBe(0);
  });
});

describe("visitasUltimos30Dias", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i1",
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });

  it("cuenta solo los ingresos de los últimos 30 días, del cliente correcto", () => {
    const ahora = new Date("2026-07-05T12:00:00Z");
    const ingresos = [
      ingreso("c1", "2026-06-06T09:00:00Z"), // dentro del período
      ingreso("c1", "2026-06-30T09:00:00Z"), // dentro del período
      ingreso("c1", "2026-06-01T09:00:00Z"), // fuera del período
      ingreso("otro", "2026-06-20T09:00:00Z"), // otro cliente
    ];
    expect(visitasUltimos30Dias(ingresos, "c1", ahora)).toBe(2);
  });
});

describe("mesKey", () => {
  it("arma la clave YYYY-MM de una fecha ISO", () => {
    expect(mesKey("2026-03-05T12:00:00.000Z")).toBe("2026-03");
  });
});

describe("fmtCLP", () => {
  it("redondea y formatea con separador de miles chileno", () => {
    expect(fmtCLP(19990)).toBe("$19.990");
    expect(fmtCLP(1000.6)).toBe("$1.001");
  });
});

describe("precioLavadoAdicional", () => {
  it("sin precio cargado -> el valor por defecto, aparte del lavado único", () => {
    expect(precioLavadoAdicional({})).toBe(PRECIO_LAVADO_ADICIONAL);
    expect(precioLavadoUnico({})).toBe(PRECIO_LAVADO_UNICO);
  });

  it("cada uno lee su propia clave: editar uno no mueve al otro", () => {
    const precios = { [LAVADO_ADICIONAL_KEY]: { normal: 2990, promo: 0 }, [LAVADO_UNICO_KEY]: { normal: 12990, promo: 0 } };
    expect(precioLavadoAdicional(precios)).toBe(2990);
    expect(precioLavadoUnico(precios)).toBe(12990);
  });
});

describe("precioContratacion", () => {
  const conPrimera = { plan1: { normal: 21990, promo: 19990 }, [keyPrimeraContratacion("plan1")]: { normal: 14990, promo: 0 } };

  it("cliente que nunca tuvo plan (o patente que no existe) -> precio de 1ra contratación", () => {
    expect(precioContratacion(conPrimera, "plan1")).toBe(14990);
    expect(precioContratacion(conPrimera, "plan1", { vencimiento: null })).toBe(14990);
  });

  it("cliente que dejó vencer su plan -> precio normal, no es cliente nuevo", () => {
    expect(precioContratacion(conPrimera, "plan1", { vencimiento: "2026-01-01T00:00:00Z" })).toBe(21990);
  });

  it("sin valor de 1ra contratación cargado -> precio normal", () => {
    expect(precioContratacion({ plan1: { normal: 21990, promo: 19990 } }, "plan1")).toBe(21990);
    expect(precioContratacion({ ...conPrimera, [keyPrimeraContratacion("plan1")]: { normal: 0, promo: 0 } }, "plan1")).toBe(21990);
  });
});

describe("precioRenovacionCliente", () => {
  // Mismo helper que usan /api/pagos/estado (lo que ve el cliente en /pagar) y
  // /api/pagos/webpay/crear (lo que cobra Webpay): estos casos son el contrato
  // que impide que pantalla y cobro se separen.
  const precios = { plan1: { normal: 29990, promo: 21990 } };
  const haceDias = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString();
  };

  it("plan vigente -> el preferencial de renovar a tiempo, con su heredado si lo tiene", () => {
    // NO el normal (29990): ese es precio de lista, y cobrarlo acá hacía que
    // renovar antes de vencer saliera más caro que pagar tarde dentro de la
    // gracia (ver precioRenovacionATiempo).
    expect(precioRenovacionCliente(precios, "plan1", { vencimiento: haceDias(-20) }, 4)).toBe(21990);
    expect(precioRenovacionCliente(precios, "plan1", { vencimiento: haceDias(-20), precioPlanHeredado: 19990 }, 4)).toBe(19990);
  });

  it("vencido dentro del plazo -> lo mismo que precioPagoAtrasado, no el precio de lista", () => {
    const cliente = { vencimiento: haceDias(3) };
    expect(precioRenovacionCliente(precios, "plan1", cliente, 4)).toBe(precioPagoAtrasado(precios, "plan1", cliente, 4));
    expect(precioRenovacionCliente(precios, "plan1", cliente, 4)).toBe(21990);
  });

  it("vencido fuera del plazo -> precio de lista", () => {
    expect(precioRenovacionCliente(precios, "plan1", { vencimiento: haceDias(9), precioPlanHeredado: 19990 }, 4)).toBe(29990);
  });

  it("patente sin plan -> precio normal", () => {
    expect(precioRenovacionCliente(precios, "plan1", {}, 4)).toBe(29990);
  });
});

describe("precioPagoAtrasado", () => {
  // Mismo patrón de precios que producción: `normal` es el precio de lista
  // (el que se muestra tachado) y `promo` el que realmente paga quien renueva
  // a tiempo.
  const precios = { plan1: { normal: 29990, promo: 21990 } };
  const haceDias = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString();
  };

  it("dentro del plazo paga lo mismo que renovando a tiempo, no el precio de lista", () => {
    expect(precioPagoAtrasado(precios, "plan1", { vencimiento: haceDias(3) }, 4)).toBe(21990);
  });

  it("dentro del plazo con precio heredado, se le respeta el heredado", () => {
    expect(precioPagoAtrasado(precios, "plan1", { vencimiento: haceDias(3), precioPlanHeredado: 19990 }, 4)).toBe(19990);
  });

  it("pasado el plazo paga el precio de lista, aunque tenga heredado", () => {
    expect(precioPagoAtrasado(precios, "plan1", { vencimiento: haceDias(5) }, 4)).toBe(29990);
    expect(precioPagoAtrasado(precios, "plan1", { vencimiento: haceDias(5), precioPlanHeredado: 19990 }, 4)).toBe(29990);
  });

  it("sin precio preferencial cargado cae al normal", () => {
    expect(precioPagoAtrasado({ plan1: { normal: 29990, promo: 0 } }, "plan1", { vencimiento: haceDias(2) }, 4)).toBe(29990);
  });
});

describe("precioReactivacionVencido", () => {
  const config: ConfigGlobal = {
    ...CONFIG_DEFAULT,
    tramosReactivacionVencido: {
      plan1: [
        { id: "t1", diasVencidoMin: 0, diasVencidoMax: 15, visitasMin: 0, visitasMax: 1, precio: 15990 },
        { id: "t2", diasVencidoMin: 16, diasVencidoMax: null, visitasMin: 0, visitasMax: 1, precio: 17990 },
        { id: "t3", diasVencidoMin: 0, diasVencidoMax: null, visitasMin: 2, visitasMax: null, precio: 18990 },
      ],
    },
  };

  it("calza por ambos rangos (días vencido y visitas)", () => {
    expect(precioReactivacionVencido(config, "plan1", 15, 1, "LOCAL")).toBe(15990);
  });

  it("tramo con techo abierto en días vencido", () => {
    expect(precioReactivacionVencido(config, "plan1", 40, 0, "WEB")).toBe(17990);
  });

  it("tramo con techo abierto en visitas", () => {
    expect(precioReactivacionVencido(config, "plan1", 5, 10, "LOCAL")).toBe(18990);
  });

  it("sin tramos para el plan ni para el Plan X5 -> undefined (no se ofrece promoción)", () => {
    expect(precioReactivacionVencido(config, "otro-plan", 15, 1, "LOCAL")).toBeUndefined();
  });

  it("un plan sin escala propia usa la del Plan X5 (el ilimitado legacy reactiva al producto que se vende hoy)", () => {
    const soloX5: ConfigGlobal = {
      ...CONFIG_DEFAULT,
      tramosReactivacionVencido: {
        "Plan X5": [{ id: "web", diasVencidoMin: 0, diasVencidoMax: 150, visitasMin: 1, visitasMax: 5, precio: 19990, canal: "WEB" }],
      },
    };
    expect(precioReactivacionVencido(soloX5, "Plan Ilimitado Mensual", 11, 1, "WEB")).toBe(19990);
    // El canal del tramo sigue mandando: esa promo Web no se cobra en el mesón.
    expect(precioReactivacionVencido(soloX5, "Plan Ilimitado Mensual", 11, 1, "LOCAL")).toBeUndefined();
    // Y el plan con escala propia no la pierde por existir la del X5.
    expect(precioReactivacionVencido({ ...soloX5, tramosReactivacionVencido: { ...soloX5.tramosReactivacionVencido, ...config.tramosReactivacionVencido } }, "plan1", 15, 1, "LOCAL")).toBe(15990);
  });

  it("tramo sin canal (guardado antes de la opción) vale para los dos canales", () => {
    expect(precioReactivacionVencido(config, "plan1", 15, 1, "WEB")).toBe(15990);
    expect(precioReactivacionVencido(config, "plan1", 15, 1, "LOCAL")).toBe(15990);
  });

  it("tramo marcado para un canal solo se ofrece por ese canal", () => {
    const soloWeb: ConfigGlobal = {
      ...CONFIG_DEFAULT,
      tramosReactivacionVencido: {
        plan1: [{ id: "t1", diasVencidoMin: 0, diasVencidoMax: 15, visitasMin: 0, visitasMax: null, precio: 15990, canal: "WEB" }],
      },
    };
    expect(precioReactivacionVencido(soloWeb, "plan1", 10, 0, "WEB")).toBe(15990);
    expect(precioReactivacionVencido(soloWeb, "plan1", 10, 0, "LOCAL")).toBeUndefined();
  });

  it("con rangos que se pisan, el tramo del canal específico le gana al de AMBOS", () => {
    const mixto: ConfigGlobal = {
      ...CONFIG_DEFAULT,
      tramosReactivacionVencido: {
        plan1: [
          { id: "ambos", diasVencidoMin: 0, diasVencidoMax: 15, visitasMin: 0, visitasMax: null, precio: 17990, canal: "AMBOS" },
          { id: "web", diasVencidoMin: 0, diasVencidoMax: 15, visitasMin: 0, visitasMax: null, precio: 14990, canal: "WEB" },
        ],
      },
    };
    expect(precioReactivacionVencido(mixto, "plan1", 10, 0, "WEB")).toBe(14990);
    expect(precioReactivacionVencido(mixto, "plan1", 10, 0, "LOCAL")).toBe(17990);
  });
});

function ventaLavadoUnicoBase(overrides: Partial<Venta> = {}): Venta {
  return {
    id: "v1",
    clienteId: "c1",
    patente: "AB1234",
    nombre: "JUAN PEREZ",
    plan: "",
    precio: 9990,
    tipo: "Lavado único",
    fecha: "2026-01-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("ventaLavadoUnicoDeIngreso", () => {
  it("matchea la venta del mismo cliente con fecha casi idéntica a la del ingreso", () => {
    const venta = ventaLavadoUnicoBase({ fecha: "2026-01-05T10:00:00.500Z" });
    const ingreso: Pick<Ingreso, "clienteId" | "fecha"> = { clienteId: "c1", fecha: "2026-01-05T10:00:00.000Z" };

    expect(ventaLavadoUnicoDeIngreso([venta], ingreso)).toBe(venta);
  });

  it("ignora ventas de otro tipo (p.ej. Plan nuevo o Renovación) aunque calcen en fecha", () => {
    const venta = ventaLavadoUnicoBase({ tipo: "Plan nuevo" });
    const ingreso: Pick<Ingreso, "clienteId" | "fecha"> = { clienteId: "c1", fecha: venta.fecha };

    expect(ventaLavadoUnicoDeIngreso([venta], ingreso)).toBeUndefined();
  });

  it("ignora ventas fuera de la tolerancia de tiempo (otra visita, no la pareja de este ingreso)", () => {
    const venta = ventaLavadoUnicoBase({ fecha: "2026-01-05T09:00:00.000Z" });
    const ingreso: Pick<Ingreso, "clienteId" | "fecha"> = { clienteId: "c1", fecha: "2026-01-05T10:00:00.000Z" };

    expect(ventaLavadoUnicoDeIngreso([venta], ingreso)).toBeUndefined();
  });

  it("ignora ventas de otro cliente", () => {
    const venta = ventaLavadoUnicoBase({ clienteId: "c2" });
    const ingreso: Pick<Ingreso, "clienteId" | "fecha"> = { clienteId: "c1", fecha: venta.fecha };

    expect(ventaLavadoUnicoDeIngreso([venta], ingreso)).toBeUndefined();
  });

  it("con varias candidatas, elige la más cercana en el tiempo", () => {
    const lejana = ventaLavadoUnicoBase({ id: "v-lejana", fecha: "2026-01-05T10:00:30.000Z" });
    const cercana = ventaLavadoUnicoBase({ id: "v-cercana", fecha: "2026-01-05T10:00:01.000Z" });
    const ingreso: Pick<Ingreso, "clienteId" | "fecha"> = { clienteId: "c1", fecha: "2026-01-05T10:00:00.000Z" };

    expect(ventaLavadoUnicoDeIngreso([lejana, cercana], ingreso)).toBe(cercana);
  });
});

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

describe("ventaLavadoWebPendiente", () => {
  it("encuentra una venta de Lavado único (Web) sin canjear del cliente", () => {
    const venta = ventaLavadoWebBase();
    expect(ventaLavadoWebPendiente([venta], "c1")).toBe(venta);
  });

  it("ignora una venta ya canjeada", () => {
    const venta = ventaLavadoWebBase({ canjeadaEn: "2026-01-06T10:00:00.000Z" });
    expect(ventaLavadoWebPendiente([venta], "c1")).toBeUndefined();
  });

  it("ignora ventas de otro cliente", () => {
    const venta = ventaLavadoWebBase({ clienteId: "c2" });
    expect(ventaLavadoWebPendiente([venta], "c1")).toBeUndefined();
  });

  it("ignora un Lavado único presencial (sin '(Web)')", () => {
    const venta = ventaLavadoWebBase({ tipo: "Lavado único" });
    expect(ventaLavadoWebPendiente([venta], "c1")).toBeUndefined();
  });

  it("con varias sin canjear, elige la más antigua", () => {
    const nueva = ventaLavadoWebBase({ id: "v-nueva", fecha: "2026-01-06T10:00:00.000Z" });
    const vieja = ventaLavadoWebBase({ id: "v-vieja", fecha: "2026-01-04T10:00:00.000Z" });
    expect(ventaLavadoWebPendiente([nueva, vieja], "c1")).toBe(vieja);
  });
});

describe("resolverDescuento", () => {
  const cuponBase: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Lote de prueba",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    esPorcentaje: false,
    valor: 5000,
    usado: false,
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 86400000).toISOString(),
  };

  const registrado: Cliente = { id: "c1", nombre: "Ana", patente: "AB1234", creadoEn: new Date().toISOString() };

  it("acepta un cupón válido y sin restricción de patente", () => {
    const r = resolverDescuento("abc123", "AB1234", [cuponBase], []);
    expect(r.ok).toBe(true);
  });

  it("rechaza código inexistente", () => {
    const r = resolverDescuento("ZZZZZZ", "AB1234", [cuponBase], []);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón ya usado", () => {
    const r = resolverDescuento("abc123", "AB1234", [{ ...cuponBase, usado: true }], []);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón caducado", () => {
    const caducado = { ...cuponBase, fechaCaducidad: new Date(Date.now() - 86400000).toISOString() };
    const r = resolverDescuento("abc123", "AB1234", [caducado], []);
    expect(r.ok).toBe(false);
  });

  it("rechaza un cupón asignado a otra patente", () => {
    const asignado = { ...cuponBase, patenteAsignada: "ZZ9999" };
    const r = resolverDescuento("abc123", "AB1234", [asignado], []);
    expect(r.ok).toBe(false);
  });

  describe("solo clientes nuevos", () => {
    const soloNuevos = { ...cuponBase, soloClientesNuevos: true };

    it("acepta una patente sin ficha", () => {
      expect(resolverDescuento("abc123", "AB1234", [soloNuevos], []).ok).toBe(true);
    });

    it("rechaza una patente que ya es cliente", () => {
      const r = resolverDescuento("abc123", "AB1234", [soloNuevos], [registrado]);
      expect(r).toEqual({ ok: false, msg: "Este descuento es solo para clientes nuevos" });
    });

    it("no restringe si el cupón no lleva la regla", () => {
      expect(resolverDescuento("abc123", "AB1234", [cuponBase], [registrado]).ok).toBe(true);
    });
  });

  describe("un uso por patente", () => {
    const reusable = { ...cuponBase, unUsoPorPatente: true };

    it("sigue vigente para una patente que no lo ha usado", () => {
      const usadoPorOtra = { ...reusable, patentesUsadas: ["ZZ9999"] };
      expect(resolverDescuento("abc123", "AB1234", [usadoPorOtra], []).ok).toBe(true);
    });

    it("rechaza a la patente que ya lo usó", () => {
      const usadoPorEsta = { ...reusable, patentesUsadas: ["ZZ9999", "AB1234"] };
      const r = resolverDescuento("abc123", "AB1234", [usadoPorEsta], []);
      expect(r).toEqual({ ok: false, msg: "Esta patente ya usó este descuento" });
    });

    it("compara la patente normalizada", () => {
      const usadoPorEsta = { ...reusable, patentesUsadas: ["ab-1234"] };
      expect(resolverDescuento("abc123", "AB1234", [usadoPorEsta], []).ok).toBe(false);
    });

    it("ignora el flag global `usado`: el código no muere en el primer canje", () => {
      const conUsadoViejo = { ...reusable, usado: true, patenteUso: "ZZ9999" };
      expect(resolverDescuento("abc123", "AB1234", [conUsadoViejo], []).ok).toBe(true);
    });
  });

  describe("canal", () => {
    it("rechaza en el mesón un descuento solo web", () => {
      const soloWeb: Cupon = { ...cuponBase, canal: "web" };
      expect(resolverDescuento("abc123", "AB1234", [soloWeb], [])).toEqual({
        ok: false,
        msg: "Este descuento es solo para pagos por la web",
      });
    });

    it("acepta uno solo local y uno de ambos", () => {
      expect(resolverDescuento("abc123", "AB1234", [{ ...cuponBase, canal: "local" }], []).ok).toBe(true);
      expect(resolverDescuento("abc123", "AB1234", [{ ...cuponBase, canal: "ambos" }], []).ok).toBe(true);
    });
  });
});

describe("marcarDescuentoUsado", () => {
  const base: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Lote",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    valor: 5000,
    usado: false,
    creadoEn: "2026-01-01T00:00:00.000Z",
    fechaCaducidad: "2026-12-31T00:00:00.000Z",
  };

  it("quema entero un descuento normal", () => {
    const r = marcarDescuentoUsado(base, "ab-1234", "Juan", "2026-02-01T10:00:00.000Z");
    expect(r).toMatchObject({ usado: true, patenteUso: "AB1234", fechaUso: "2026-02-01T10:00:00.000Z", operadorUso: "Juan" });
  });

  it("en uno de un uso por patente solo suma la patente y lo deja vigente", () => {
    const reusable = { ...base, unUsoPorPatente: true, patentesUsadas: ["ZZ9999"] };
    const r = marcarDescuentoUsado(reusable, "ab-1234", "Juan", "2026-02-01T10:00:00.000Z");
    expect(r.usado).toBe(false);
    expect(r.patentesUsadas).toEqual(["ZZ9999", "AB1234"]);
  });

  it("arranca la lista si todavía no tenía usos", () => {
    const reusable = { ...base, unUsoPorPatente: true };
    expect(marcarDescuentoUsado(reusable, "AB1234", undefined, "2026-02-01T10:00:00.000Z").patentesUsadas).toEqual(["AB1234"]);
  });
});

describe("cuponDescuentoDePatente", () => {
  const base: Cupon = {
    id: "cu1",
    codigo: "AAA111",
    nombreLote: "Lote",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    valor: 2000,
    usado: false,
    patenteAsignada: "AB1234",
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 30 * 86400000).toISOString(),
  };

  it("toma el cupón vigente de esa patente", () => {
    expect(cuponDescuentoDePatente([base], "AB1234", "local")?.codigo).toBe("AAA111");
  });

  it("ignora usados, caducados, de otra patente y los que no son descuento", () => {
    const lista: Cupon[] = [
      { ...base, id: "a", codigo: "USADO1", usado: true },
      { ...base, id: "b", codigo: "VENC01", fechaCaducidad: new Date(Date.now() - 86400000).toISOString() },
      { ...base, id: "c", codigo: "OTRA01", patenteAsignada: "ZZ9999" },
      { ...base, id: "d", codigo: "VALE01", tipo: "vale" },
    ];
    expect(cuponDescuentoDePatente(lista, "AB1234", "local")).toBeUndefined();
  });

  it("con varios vigentes usa primero el que vence antes", () => {
    const lejano = { ...base, id: "lejano", codigo: "LEJOS1", fechaCaducidad: new Date(Date.now() + 60 * 86400000).toISOString() };
    const pronto = { ...base, id: "pronto", codigo: "PRONT1", fechaCaducidad: new Date(Date.now() + 2 * 86400000).toISOString() };
    expect(cuponDescuentoDePatente([lejano, pronto], "AB1234", "local")?.codigo).toBe("PRONT1");
  });

  it("filtra por canal: uno solo local no rebaja un cobro web y viceversa", () => {
    const soloLocal: Cupon = { ...base, canal: "local" };
    const soloWeb: Cupon = { ...base, canal: "web" };
    expect(cuponDescuentoDePatente([soloLocal], "AB1234", "local")?.codigo).toBe("AAA111");
    expect(cuponDescuentoDePatente([soloLocal], "AB1234", "web")).toBeUndefined();
    expect(cuponDescuentoDePatente([soloWeb], "AB1234", "web")?.codigo).toBe("AAA111");
    expect(cuponDescuentoDePatente([soloWeb], "AB1234", "local")).toBeUndefined();
  });

  it("un cupón sin canal (los ya emitidos) sigue valiendo en los dos", () => {
    expect(cuponDescuentoDePatente([base], "AB1234", "web")?.codigo).toBe("AAA111");
    expect(cuponDescuentoDePatente([{ ...base, canal: "ambos" }], "AB1234", "web")?.codigo).toBe("AAA111");
  });
});

describe("precioConCupon", () => {
  it("resta un monto fijo y un porcentaje", () => {
    expect(precioConCupon(21990, { valor: 2000, esPorcentaje: false })).toBe(19990);
    expect(precioConCupon(20000, { valor: 10, esPorcentaje: true })).toBe(18000);
  });

  it("sin cupón devuelve el precio tal cual y nunca baja de $0", () => {
    expect(precioConCupon(21990, undefined)).toBe(21990);
    expect(precioConCupon(1000, { valor: 5000, esPorcentaje: false })).toBe(0);
  });
});

describe("ofertaConCupon", () => {
  const cupon = { valor: 2000, esPorcentaje: false };

  it("descuenta todo lo cobrable y recalcula el ahorro contra el precio final", () => {
    const o = ofertaConCupon(
      {
        renovacionAnticipada: { pNormal: 25000, pPromo: 21990, ahorro: 3010, tramoVigente: true },
        reactivacion: { precio: 18000, diasVencido: 5, pNormal: 25000, visitas: 2 },
        upgrade: { precio: 12000 },
        pagoVencido: { precio: 21990, diasVencido: 40 },
      },
      cupon
    );
    expect(o.renovacionAnticipada).toMatchObject({ pNormal: 25000, pPromo: 19990, ahorro: 5010 });
    expect(o.reactivacion?.precio).toBe(16000);
    expect(o.upgrade?.precio).toBe(10000);
    expect(o.pagoVencido?.precio).toBe(19990);
  });

  it("sin cupón devuelve la misma oferta", () => {
    const original = { upgrade: { precio: 12000 } };
    expect(ofertaConCupon(original, undefined)).toBe(original);
  });
});

describe("beneficioCupon", () => {
  it("distingue % de monto fijo en un descuento", () => {
    expect(beneficioCupon({ tipo: "descuento", valor: 20, esPorcentaje: true })).toBe("20% de descuento");
    expect(beneficioCupon({ tipo: "descuento", valor: 5000, esPorcentaje: false })).toContain("5.000");
  });

  it("un vale es lavado gratis aunque el lote se haya pagado", () => {
    expect(beneficioCupon({ tipo: "vale", valor: 8000 })).toBe("Lavado gratis");
  });
});

describe("montoDescuento", () => {
  const cuponBase: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Lote de prueba",
    numeroLote: 1,
    totalLote: 1,
    tipo: "descuento",
    usado: false,
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 86400000).toISOString(),
    valor: 5000,
  };

  it("calcula el monto fijo cuando el cupón no es porcentual", () => {
    expect(montoDescuento({ ...cuponBase, esPorcentaje: false, valor: 5000 }, 19990)).toBe(5000);
  });

  it("calcula el porcentaje sobre el precio base y redondea", () => {
    expect(montoDescuento({ ...cuponBase, esPorcentaje: true, valor: 10 }, 19990)).toBe(1999);
  });
});

describe("cuponDelLoteUsadoPorPatente", () => {
  const valeBase: Cupon = {
    id: "cu1",
    codigo: "ABC123",
    nombreLote: "Cortesía Feria",
    numeroLote: 1,
    totalLote: 10,
    tipo: "vale",
    valor: 0,
    usado: false,
    creadoEn: new Date().toISOString(),
    fechaCaducidad: new Date(Date.now() + 86400000).toISOString(),
    unCuponPorPatente: true,
  };
  const yaUsado: Cupon = { ...valeBase, id: "cu0", codigo: "USADO1", numeroLote: 2, usado: true, patenteUso: "AB1234" };

  it("bloquea a una patente que ya canjeó otro cupón del mismo lote", () => {
    expect(cuponDelLoteUsadoPorPatente(valeBase, "AB1234", [valeBase, yaUsado])).toBe(yaUsado);
  });

  it("normaliza la patente antes de comparar", () => {
    expect(cuponDelLoteUsadoPorPatente(valeBase, "ab-1234", [valeBase, yaUsado])).toBe(yaUsado);
  });

  it("deja pasar a una patente distinta", () => {
    expect(cuponDelLoteUsadoPorPatente(valeBase, "ZZ9999", [valeBase, yaUsado])).toBeUndefined();
  });

  it("no aplica si el lote no tiene la regla", () => {
    const sinRegla = { ...valeBase, unCuponPorPatente: false };
    expect(cuponDelLoteUsadoPorPatente(sinRegla, "AB1234", [sinRegla, yaUsado])).toBeUndefined();
  });

  it("ignora cupones usados de otro lote", () => {
    const otroLote = { ...yaUsado, id: "cu9", nombreLote: "Otro lote" };
    expect(cuponDelLoteUsadoPorPatente(valeBase, "AB1234", [valeBase, otroLote])).toBeUndefined();
  });

  it("ignora un lote homónimo sin la regla (ej. los del bot de WhatsApp)", () => {
    const homonimoSinRegla = { ...yaUsado, id: "cu8", unCuponPorPatente: false };
    expect(cuponDelLoteUsadoPorPatente(valeBase, "AB1234", [valeBase, homonimoSinRegla])).toBeUndefined();
  });

  it("no se bloquea a sí mismo si el cupón ya está marcado como usado", () => {
    const mismo = { ...valeBase, usado: true, patenteUso: "AB1234" };
    expect(cuponDelLoteUsadoPorPatente(mismo, "AB1234", [mismo])).toBeUndefined();
  });
});

describe("esFinDeSemanaOFestivo", () => {
  it("sábado y domingo cuentan como fin de semana", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-18T12:00:00"), [])).toBe(true); // sábado
    expect(esFinDeSemanaOFestivo(new Date("2026-07-19T12:00:00"), [])).toBe(true); // domingo
  });

  it("un día de semana en la lista de festivos también cuenta", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-17T12:00:00"), ["2026-07-17"])).toBe(true); // viernes festivo
  });

  it("un día de semana normal no es fin de semana ni festivo", () => {
    expect(esFinDeSemanaOFestivo(new Date("2026-07-17T12:00:00"), [])).toBe(false); // viernes
  });
});

describe("dentroDeHorarioOperador", () => {
  const config: ConfigGlobal = CONFIG_DEFAULT; // semana 08:25-20:15, finde 09:55-19:15

  it("dentro del horario de semana en un día hábil", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T12:00:00"))).toBe(true); // viernes
  });

  it("fuera del horario de semana (antes de abrir)", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T08:00:00"))).toBe(false);
  });

  it("fuera del horario de semana (después de cerrar)", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-17T20:30:00"))).toBe(false);
  });

  it("usa el horario de fin de semana un sábado", () => {
    expect(dentroDeHorarioOperador(config, new Date("2026-07-18T10:00:00"))).toBe(true);
    expect(dentroDeHorarioOperador(config, new Date("2026-07-18T08:00:00"))).toBe(false);
  });

  it("un festivo en día de semana usa el horario de fin de semana", () => {
    const configConFestivo: ConfigGlobal = { ...config, festivos: ["2026-07-17"] };
    expect(dentroDeHorarioOperador(configConFestivo, new Date("2026-07-17T08:30:00"))).toBe(false); // ya no aplica horario de semana
    expect(dentroDeHorarioOperador(configConFestivo, new Date("2026-07-17T10:00:00"))).toBe(true); // dentro del horario de finde
  });
});

describe("esExentoHorarioOperador", () => {
  it("un perfil con acceso a Configuración está exento", () => {
    expect(esExentoHorarioOperador(["operador", "config"])).toBe(true);
  });

  it("un perfil de Administración sin acceso a Configuración también está exento", () => {
    expect(esExentoHorarioOperador(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un perfil con el módulo arqueo está exento: la caja se cuadra después de cerrado el local", () => {
    expect(esExentoHorarioOperador(["operador", "cierre", "arqueo"])).toBe(true);
  });

  it("un operador estándar sin acceso a Configuración no está exento", () => {
    expect(esExentoHorarioOperador(["operador", "servicios"])).toBe(false);
  });
});

describe("esExentoFormatoCliente", () => {
  it("los perfiles Gerencia y Administración están exentos de la validación de formato", () => {
    expect(esExentoFormatoCliente("Gerencia")).toBe(true);
    expect(esExentoFormatoCliente("Administración")).toBe(true);
  });

  it("otros perfiles no están exentos", () => {
    expect(esExentoFormatoCliente("Christian")).toBe(false);
    expect(esExentoFormatoCliente(undefined)).toBe(false);
  });
});

describe("puedeBorrarCategoriaInventario", () => {
  it("el perfil Gerencia puede borrar categorías de inventario", () => {
    expect(puedeBorrarCategoriaInventario("Gerencia")).toBe(true);
  });

  it("otros perfiles, incluido Administración, no pueden", () => {
    expect(puedeBorrarCategoriaInventario("Administración")).toBe(false);
    expect(puedeBorrarCategoriaInventario(undefined)).toBe(false);
  });
});

describe("puedeBorrarIngreso", () => {
  it("el perfil Gerencia puede borrar una fila de Historial de Ingresos", () => {
    expect(puedeBorrarIngreso("Gerencia")).toBe(true);
  });

  it("otros perfiles, incluido Administración, no pueden", () => {
    expect(puedeBorrarIngreso("Administración")).toBe(false);
    expect(puedeBorrarIngreso(undefined)).toBe(false);
  });

  it("quien tiene el módulo arqueo puede: cuadrar la caja del día es borrar ingresos cargados por error", () => {
    expect(puedeBorrarIngreso("Administración", ["ingresos", "arqueo"])).toBe(true);
    expect(puedeBorrarIngreso("Administración", ["ingresos"])).toBe(false);
  });
});

describe("soloCambiosSinPlata (guard de días cerrados)", () => {
  const venta = { id: "v1", fecha: "2026-08-16T14:00:00Z", precio: 12000, metodoPago: "efectivo", facturaEmitida: false };

  it("deja pasar marcar la factura como emitida y el canje de un lavado web", () => {
    expect(soloCambiosSinPlata(venta, { ...venta, facturaEmitida: true })).toBe(true);
    expect(soloCambiosSinPlata(venta, { ...venta, canjeadaEn: "2026-08-20T10:00:00Z" })).toBe(true);
  });

  it("bloquea cualquier cambio que mueva plata", () => {
    expect(soloCambiosSinPlata(venta, { ...venta, precio: 15000 })).toBe(false);
    expect(soloCambiosSinPlata(venta, { ...venta, metodoPago: "tarjeta" })).toBe(false);
  });

  it("bloquea las altas: en un día cerrado no se dan de alta filas nuevas", () => {
    expect(soloCambiosSinPlata(undefined, venta)).toBe(false);
  });

  it("deja pasar el movimiento contable derivado, que se rearma con otro creadoEn en cada commit", () => {
    const movimiento = { id: "m1", fecha: venta.fecha, monto: 12000, creadoEn: "2026-08-16T14:00:01Z" };
    expect(soloCambiosSinPlata(movimiento, { ...movimiento, creadoEn: "2026-08-17T09:00:00Z" })).toBe(true);
    expect(soloCambiosSinPlata(movimiento, { ...movimiento, monto: 9000 })).toBe(false);
  });
});

describe("esExentoValidacionRegistroOperador", () => {
  it("Gerencia (con acceso a Configuración) está exenta de validar teléfono/email al registrar un ingreso", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "config"], "Gerencia")).toBe(true);
  });

  it("Administración está exenta aunque no tenga acceso a Configuración", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un operador estándar no está exento", () => {
    expect(esExentoValidacionRegistroOperador(["operador", "servicios"], "Christian")).toBe(false);
  });
});

describe("esExentoBloqueoReingreso", () => {
  it("Gerencia (con acceso a Configuración) puede forzar el ingreso aunque el reingreso esté bloqueado", () => {
    expect(esExentoBloqueoReingreso(["operador", "config"], "Gerencia")).toBe(true);
  });

  it("Administración está exenta aunque no tenga acceso a Configuración", () => {
    expect(esExentoBloqueoReingreso(["operador", "servicios"], "Administración")).toBe(true);
  });

  it("un operador estándar no está exento", () => {
    expect(esExentoBloqueoReingreso(["operador", "servicios"], "Christian")).toBe(false);
  });
});

describe("ordenarPerfiles", () => {
  it("deja Administración y Gerencia al final en ese orden, el resto alfabético", () => {
    const perfiles: PerfilPublico[] = [
      { id: "1", nombre: "Gerencia", modulos: [] },
      { id: "2", nombre: "Zoe", modulos: [] },
      { id: "3", nombre: "Administración", modulos: [] },
      { id: "4", nombre: "Ana", modulos: [] },
    ];
    expect(ordenarPerfiles(perfiles).map((p) => p.nombre)).toEqual(["Ana", "Zoe", "Administración", "Gerencia"]);
  });
});

describe("esServicioTunelLibre", () => {
  it("un Lavado Completo Detailing (por categoría) da pasada libre", () => {
    expect(esServicioTunelLibre({ id: "detailing-pequeno", categoria: CATEGORIA_DETAILING })).toBe(true);
  });

  it("Lavado de Chasis, Lavado de Chasis + Grafitado y Lavado de Motor también dan pasada libre", () => {
    expect(esServicioTunelLibre({ id: "chasis", categoria: "Servicios Adicionales" })).toBe(true);
    expect(esServicioTunelLibre({ id: "chasis-grafitado", categoria: "Servicios Adicionales" })).toBe(true);
    expect(esServicioTunelLibre({ id: "motor", categoria: "Servicios Adicionales" })).toBe(true);
  });

  it("otros Servicios Adicionales (tapiz, alfombra, techo) no dan pasada libre", () => {
    expect(esServicioTunelLibre({ id: "tapiz", categoria: "Servicios Adicionales" })).toBe(false);
    expect(esServicioTunelLibre({ id: "alfombra", categoria: "Servicios Adicionales" })).toBe(false);
  });
});

describe("patchDeCliente", () => {
  const cliente = (extra: Partial<Cliente> = {}): Cliente => ({
    id: "c1",
    nombre: "Juan",
    patente: "AB1234",
    telefono: "+56912345678",
    email: "juan@mail.com",
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...extra,
  });

  it("sin anterior (alta nueva), devuelve la fila completa tal cual", () => {
    const nuevo = cliente();
    expect(patchDeCliente(undefined, nuevo)).toBe(nuevo);
  });

  it("solo incluye los campos que cambiaron respecto a anterior, más id", () => {
    const anterior = cliente();
    const siguiente = cliente({ email: "nuevo@mail.com" });
    expect(patchDeCliente(anterior, siguiente)).toEqual({ id: "c1", email: "nuevo@mail.com" });
  });

  it("caso HERNAN: una sesión desactualizada que no toca email no lo incluye en el patch", () => {
    // La sesión leyó al cliente ANTES de que otra sesión le guardara el email
    // (por eso su copia todavía no lo tiene) y ahora guarda un cambio de otro
    // tipo (p.ej. "dar ingreso" tocando visitas) — el patch resultante no debe
    // mencionar `email` en absoluto, para no pisar el valor que la otra
    // sesión ya guardó.
    const suCopiaDesactualizada = cliente({ email: undefined, visitas: 3 });
    const siguiente = cliente({ email: undefined, visitas: 4 });
    const patch = patchDeCliente(suCopiaDesactualizada, siguiente);
    expect(patch).toEqual({ id: "c1", visitas: 4 });
    expect("email" in patch).toBe(false);
  });

  it("sin ningún campo cambiado, el patch queda solo con id", () => {
    const anterior = cliente();
    const siguiente = cliente();
    expect(patchDeCliente(anterior, siguiente)).toEqual({ id: "c1" });
  });
});

describe("resolverPatentePendiente", () => {
  const anterior = (extra: Partial<Cliente> = {}): Cliente => ({
    id: "c1",
    nombre: "Juan",
    patente: "AB1234",
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...extra,
  });

  it("sin patentePendiente, devuelve la fila (patch) sin tocar nada", () => {
    const patch = { id: "c1", email: "x@mail.com" };
    expect(resolverPatentePendiente(anterior(), patch)).toEqual({ fila: patch });
  });

  it("con patentePendiente pero sin renovación (patch no toca vencimiento), preserva la solicitud pendiente", () => {
    const conSolicitud = anterior({ vencimiento: "2026-01-10", patentePendiente: "XY9876", patentePendienteDesde: "2026-01-05" });
    const patch = { id: "c1", email: "x@mail.com" };
    expect(resolverPatentePendiente(conSolicitud, patch)).toEqual({
      fila: { id: "c1", email: "x@mail.com", patentePendiente: "XY9876", patentePendienteDesde: "2026-01-05" },
    });
  });

  it("renovación real (vencimiento avanza), aplica el swap de patente y limpia la solicitud", () => {
    const conSolicitud = anterior({ vencimiento: "2026-01-10", patentePendiente: "XY9876", patentePendienteDesde: "2026-01-05" });
    const patch = { id: "c1", vencimiento: "2026-02-10" };
    const { fila, patenteAnterior } = resolverPatentePendiente(conSolicitud, patch);
    expect(fila).toEqual({ id: "c1", vencimiento: "2026-02-10", patente: "XY9876", patentePendiente: null, patentePendienteDesde: null });
    expect(patenteAnterior).toBe("AB1234");
  });

  it("un patch parcial que no incluye vencimiento nunca cuenta como renovación", () => {
    const conSolicitud = anterior({ vencimiento: "2026-01-10", patentePendiente: "XY9876", patentePendienteDesde: "2026-01-05" });
    const patch = { id: "c1", visitas: 5 };
    const { fila, patenteAnterior } = resolverPatentePendiente(conSolicitud, patch);
    expect(patenteAnterior).toBeUndefined();
    expect(fila.patente).toBeUndefined();
    expect(fila.patentePendiente).toBe("XY9876");
  });
});

describe("ventaUpgradeElegible", () => {
  const ahora = new Date("2026-01-05T12:00:00.000Z");

  it("un 'Lavado único' presencial reciente califica", () => {
    const venta = ventaLavadoUnicoBase({ fecha: "2026-01-05T10:00:00.000Z" });
    expect(ventaUpgradeElegible([venta], "c1", 24, ahora)).toBe(venta);
  });

  it("un 'Lavado único (Web)' YA CANJEADO reciente también califica", () => {
    const venta = ventaLavadoUnicoBase({
      tipo: "Lavado único (Web)",
      fecha: "2026-01-05T10:00:00.000Z",
      canjeadaEn: "2026-01-05T10:05:00.000Z",
    });
    expect(ventaUpgradeElegible([venta], "c1", 24, ahora)).toBe(venta);
  });

  it("un 'Lavado único (Web)' SIN canjear no califica (sigue siendo un vale pendiente)", () => {
    const venta = ventaLavadoUnicoBase({ tipo: "Lavado único (Web)", fecha: "2026-01-05T10:00:00.000Z" });
    expect(ventaUpgradeElegible([venta], "c1", 24, ahora)).toBeUndefined();
  });

  it("fuera de la ventana configurada, ninguno de los dos califica", () => {
    const presencial = ventaLavadoUnicoBase({ fecha: "2026-01-01T10:00:00.000Z" });
    const web = ventaLavadoUnicoBase({
      tipo: "Lavado único (Web)",
      fecha: "2026-01-01T10:00:00.000Z",
      canjeadaEn: "2026-01-01T10:05:00.000Z",
    });
    expect(ventaUpgradeElegible([presencial], "c1", 24, ahora)).toBeUndefined();
    expect(ventaUpgradeElegible([web], "c1", 24, ahora)).toBeUndefined();
  });
});

describe("calcularOfertasPlan", () => {
  const PLAN = PLAN_X5;
  const precios: Precios = { [PLAN]: { normal: 21990, promo: 19990 } };
  const config: ConfigGlobal = {
    ...CONFIG_DEFAULT,
    tramosRenovacionLocal: { [PLAN]: [{ id: "r1", visitasMin: 0, visitasMax: null, precio: 15990 }] },
    tramosReactivacionVencido: {
      [PLAN]: [{ id: "t1", diasVencidoMin: 0, diasVencidoMax: 20, visitasMin: 0, visitasMax: null, precio: 17990 }],
    },
    horasVentanaUpgradePlan: 24,
  };
  const diasDesdeHoy = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString();
  };
  const horasDesdeAhora = (horas: number) => {
    const d = new Date();
    d.setHours(d.getHours() - horas);
    return d.toISOString();
  };
  // Pasada del período de plan vigente (ver visitasPeriodoPlan), el eje de la
  // escala de renovación anticipada: los clientes de este bloque contratan
  // hace 10 días, así que un ingreso de ayer cae dentro del período vigente.
  const ingresoAyer = (): Ingreso => ({
    id: "i1",
    clienteId: "c1",
    patente: "AB1234",
    nombre: "Cliente",
    fecha: diasDesdeHoy(-1),
    planEstadoAlIngreso: "ok",
  });

  it("plan vigente -> ofrece renovación anticipada al precio del tramo, sin reactivación ni upgrade", () => {
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10) };
    const oferta = calcularOfertasPlan(cliente, [], [], config, precios);
    // pNormal = lo que paga renovando a tiempo sin tramo (el preferencial,
    // ver precioRenovacionATiempo), no el precio de lista.
    expect(oferta.renovacionAnticipada).toEqual({ pNormal: 19990, pPromo: 15990, ahorro: 4000, diasRestantes: undefined, tramoVigente: true });
    expect(oferta.reactivacion).toBeUndefined();
    expect(oferta.upgrade).toBeUndefined();
  });

  it("precio heredado -> renueva a lo que venía pagando, sin ahorro inventado, y nunca por sobre ese valor", () => {
    // Cliente que venía de $19.990 cuando el plan ya está en $21.990 (ver
    // precioConHeredado): renovar antes de vencer le respeta su precio.
    const sinTramos: ConfigGlobal = { ...config, tramosRenovacionLocal: {} };
    const heredado = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10), precioPlanHeredado: 19990 };
    const oferta = calcularOfertasPlan(heredado, [], [], sinTramos, { [PLAN]: { normal: 21990, promo: 21990 } }).renovacionAnticipada;
    expect(oferta?.pPromo).toBe(19990);
    // pNormal también baja: si no, la tarjeta le anuncia un "ahorro" contra un
    // precio de lista que a este cliente nunca le tocó.
    expect(oferta?.pNormal).toBe(19990);
    expect(oferta?.ahorro).toBe(0);
    // Un tramo promocional mejor que el heredado gana: el heredado es un techo,
    // no un piso.
    expect(calcularOfertasPlan(heredado, [], [], config, precios).renovacionAnticipada?.pPromo).toBe(15990);
    // Y un heredado más caro que el precio vigente se ignora (nunca sube).
    const caro = { ...heredado, precioPlanHeredado: 27980 };
    expect(calcularOfertasPlan(caro, [], [], sinTramos, precios).renovacionAnticipada?.pPromo).toBe(19990);
  });

  it("pasadas del período vigente por sobre el último tramo -> sin promoción, renueva al precio de siempre", () => {
    // El tramo llega hasta 1 pasada: con 2 en el período vigente el cliente
    // "viene mucho" y queda fuera del descuento por tramo (ahorro 0). Paga
    // la renovación de siempre — el preferencial del plan, no el de lista:
    // ese último es de quien deja vencer su plan (ver precioRenovacionATiempo).
    const soloPocasPasadas: ConfigGlobal = {
      ...config,
      tramosRenovacionLocal: { [PLAN]: [{ id: "r1", visitasMin: 0, visitasMax: 1, precio: 15990 }] },
    };
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10) };
    const dosPasadas = [ingresoAyer(), { ...ingresoAyer(), id: "i2", fecha: diasDesdeHoy(-2) }];
    expect(calcularOfertasPlan(cliente, [], dosPasadas, soloPocasPasadas, precios).renovacionAnticipada).toEqual({
      pNormal: 19990,
      pPromo: 19990,
      ahorro: 0,
      diasRestantes: undefined,
      tramoVigente: false,
    });
    // Con una sola pasada sí califica.
    expect(calcularOfertasPlan(cliente, [], [ingresoAyer()], soloPocasPasadas, precios).renovacionAnticipada?.pPromo).toBe(15990);
  });

  it("tramo marcado 'Solo Web' -> solo aplica por el canal Web; en Local cae al precio preferencial general", () => {
    const soloWeb: ConfigGlobal = {
      ...config,
      tramosRenovacionLocal: { [PLAN]: [{ id: "r1", visitasMin: 0, visitasMax: null, precio: 15990, canal: "WEB" }] },
    };
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10) };
    const ofertaWeb = calcularOfertasPlan(cliente, [], [], soloWeb, precios).renovacionAnticipada;
    expect(ofertaWeb?.pPromo).toBe(15990);
    expect(ofertaWeb?.tramoVigente).toBe(true);
    // El canal Local no tiene ningún tramo configurado, así que conserva el
    // respaldo histórico: el precio de promoción general (Precios[plan].promo)
    // — pero tramoVigente queda en false, porque ese respaldo no es un tramo
    // real (ver comentario en tramoRenovacionVigente/@/lib/helpers/precios).
    const ofertaLocal = calcularOfertasPlan(cliente, [], [], soloWeb, precios, "LOCAL").renovacionAnticipada;
    expect(ofertaLocal?.pPromo).toBe(19990);
    expect(ofertaLocal?.tramoVigente).toBe(false);
  });

  it("sin tramos configurados -> el precio de promoción general sigue siendo la oferta, pero sin tramoVigente", () => {
    const sinTramos: ConfigGlobal = { ...config, tramosRenovacionLocal: {} };
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10) };
    const oferta = calcularOfertasPlan(cliente, [], [ingresoAyer()], sinTramos, precios).renovacionAnticipada;
    expect(oferta?.pPromo).toBe(19990);
    // Este es justo el caso que condicionSoloConPromoRenovacion (ver
    // @/lib/mailing/reglas/cron) necesita distinguir: hay un precio "promo"
    // que mostrar, pero no es una promoción real por tramos.
    expect(oferta?.tramoVigente).toBe(false);
  });

  it("plan por vencer -> igual ofrece renovación anticipada, con diasRestantes definido", () => {
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(3), fechaContratacion: diasDesdeHoy(-27) };
    const oferta = calcularOfertasPlan(cliente, [], [], config, precios);
    // No se compara un valor exacto: planStatus calcula sobre el día
    // calendario en horario de Chile (ahoraEnSantiago), así que el redondeo
    // exacto depende de la hora/zona horaria en que corra el test — el
    // dato relevante acá es que la promoción se ofrece igual estando "por
    // vencer", con el mismo `diasRestantes` que ya calcula planStatus.
    expect(oferta.renovacionAnticipada?.diasRestantes).toBeGreaterThan(0);
    expect(oferta.renovacionAnticipada?.diasRestantes).toBeLessThanOrEqual(7);
  });

  it("plan vencido hace pocos días con tramo que calza -> ofrece reactivación, no renovación anticipada", () => {
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-10), visitas: 0 };
    const oferta = calcularOfertasPlan(cliente, [], [], config, precios);
    expect(oferta.renovacionAnticipada).toBeUndefined();
    // diasVencido puede variar en ±1 según la zona horaria en que corra el
    // test (planStatus/diasVencido calculan sobre el día calendario en hora
    // de Chile, ver ahoraEnSantiago) — lo que importa acá es que cae dentro
    // del tramo [0,20] configurado arriba y cobra su precio.
    expect(oferta.reactivacion?.precio).toBe(17990);
    expect(oferta.reactivacion?.diasVencido).toBeGreaterThanOrEqual(9);
    expect(oferta.reactivacion?.diasVencido).toBeLessThanOrEqual(11);
  });

  it("la reactivación expone las pasadas del último período pagado (eje del tramo, y {{pasadas}} en el correo)", () => {
    // El período que cuenta es el mes que TERMINA en el vencimiento (ver
    // visitasUltimoPeriodoVencido): el ingreso de ayer es posterior, ya sin
    // plan pagado, y no suma.
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-10) };
    const ingreso = (id: string, dias: number): Ingreso => ({ ...ingresoAyer(), id, fecha: diasDesdeHoy(dias) });
    const oferta = calcularOfertasPlan(cliente, [], [ingreso("i1", -12), ingreso("i2", -20), ingreso("i3", -1)], config, precios);
    expect(oferta.reactivacion?.visitas).toBe(2);
  });

  it("plan vencido fuera de todos los tramos de reactivación -> sin promoción, pero el plan sigue pagable al precio normal", () => {
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-60), visitas: 0 };
    const oferta = calcularOfertasPlan(cliente, [], [], config, precios);
    expect(oferta.reactivacion).toBeUndefined();
    // Sin esto el cliente vencido hace mucho se queda sin ningún botón de pago
    // en Mi Cuenta (ver pagoVencido en @/lib/helpers/ofertasPlan).
    expect(oferta.pagoVencido?.precio).toBe(21990);
    expect(oferta.pagoVencido?.diasVencido).toBeGreaterThanOrEqual(59);
  });

  it("pago de plan vencido: dentro de los días de gracia respeta el precio de contratación, pasado el plazo no", () => {
    const sinReactivacion: ConfigGlobal = { ...config, tramosReactivacionVencido: {}, diasGraciaPagoAtrasado: 4 };
    const heredado = { id: "c1", plan: PLAN, precioPlanHeredado: 19990 };
    const enPlazo = calcularOfertasPlan({ ...heredado, vencimiento: diasDesdeHoy(-3) }, [], [], sinReactivacion, precios);
    expect(enPlazo.pagoVencido?.precio).toBe(19990);
    // Sin heredado, dentro del plazo igual paga el preferencial (lo que
    // pagaría renovando a tiempo), no el precio de lista.
    const sinHeredado = calcularOfertasPlan({ id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-3) }, [], [], sinReactivacion, precios);
    expect(sinHeredado.pagoVencido?.precio).toBe(19990);
    const fueraDePlazo = calcularOfertasPlan({ ...heredado, vencimiento: diasDesdeHoy(-10) }, [], [], sinReactivacion, precios);
    expect(fueraDePlazo.pagoVencido?.precio).toBe(21990);
  });

  it("pagoVencido solo existe con el plan vencido y sin promoción de reactivación", () => {
    const vigente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(20), fechaContratacion: diasDesdeHoy(-10) };
    expect(calcularOfertasPlan(vigente, [], [], config, precios).pagoVencido).toBeUndefined();
    // Vencido hace 10 días cae en el tramo [0,20]: ahí la reactivación ya es
    // este mismo pago más barato, no se ofrecen las dos juntas.
    const conTramo = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-10), visitas: 0 };
    expect(calcularOfertasPlan(conTramo, [], [], config, precios).pagoVencido).toBeUndefined();
    // Sin plan (nunca contrató) tampoco: no hay nada vencido que pagar.
    expect(calcularOfertasPlan({ id: "c1", plan: PLAN, vencimiento: null }, [], [], config, precios).pagoVencido).toBeUndefined();
  });

  it("tramo de reactivación restringido a un canal -> solo se ofrece por ese canal", () => {
    const soloLocal: ConfigGlobal = {
      ...config,
      tramosReactivacionVencido: {
        [PLAN]: [{ id: "t1", diasVencidoMin: 0, diasVencidoMax: 20, visitasMin: 0, visitasMax: null, precio: 17990, canal: "LOCAL" }],
      },
    };
    const cliente = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-10), visitas: 0 };
    // El canal por defecto es "WEB" (Mi Cuenta / pagar / correos): una
    // promoción marcada "Solo local" no se le muestra ni se le cobra ahí.
    expect(calcularOfertasPlan(cliente, [], [], soloLocal, precios).reactivacion).toBeUndefined();
    expect(calcularOfertasPlan(cliente, [], [], soloLocal, precios, "LOCAL").reactivacion?.precio).toBe(17990);
  });

  it("plan vencido + Lavado único reciente dentro de la ventana -> ofrece upgrade", () => {
    const cliente = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 9990,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(2),
    };
    const oferta = calcularOfertasPlan(cliente, [venta], [], config, precios);
    expect(oferta.upgrade).toEqual({ precio: 12000 });
  });

  it("el Lavado único se pagó con descuento -> el upgrade cobra la diferencia real, no un monto fijo", () => {
    // El cupón de primera vez ($1.000) dejó el lavado en $8.990: el adicional
    // sube a $13.000 para que igual entre al plan por los $21.990 de siempre —
    // si no, el descuento se le aplicaba dos veces.
    const cliente = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 8990,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(2),
      viaCupon: true,
    };
    const oferta = calcularOfertasPlan(cliente, [venta], [], config, precios);
    expect(oferta.upgrade).toEqual({ precio: 13000 });
  });

  it("nunca tuvo plan -> el upgrade completa el precio de 1ra contratación, no el normal", () => {
    // $14.990 de 1ra contratación - $9.990 ya pagados por el lavado. El que
    // dejó vencer su plan no es cliente nuevo: completa los $21.990 normales.
    const preciosConPrimera: Precios = { ...precios, [keyPrimeraContratacion(PLAN)]: { normal: 14990, promo: 0 } };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 9990,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(2),
    };
    const nuevo = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const vencido = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-60), visitas: 0 };
    expect(calcularOfertasPlan(nuevo, [venta], [], config, preciosConPrimera).upgrade).toEqual({ precio: 5000 });
    expect(calcularOfertasPlan(vencido, [venta], [], config, preciosConPrimera).upgrade).toEqual({ precio: 12000 });

    // 1ra contratación al precio del lavado: no queda adicional que cobrar y
    // la oferta no se muestra (un upgrade de $0 regalaría el plan).
    const primeraIgualAlLavado: Precios = { ...precios, [keyPrimeraContratacion(PLAN)]: { normal: 9990, promo: 0 } };
    expect(calcularOfertasPlan(nuevo, [venta], [], config, primeraIgualAlLavado).upgrade).toBeUndefined();
    expect(calcularOfertasPlan(vencido, [venta], [], config, primeraIgualAlLavado).upgrade).toEqual({ precio: 12000 });
  });

  it("el Lavado único ya pasó la ventana de la promoción -> no ofrece upgrade", () => {
    const cliente = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 9990,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(48),
    };
    const oferta = calcularOfertasPlan(cliente, [venta], [], config, precios);
    expect(oferta.upgrade).toBeUndefined();
  });

  it("califica para reactivación y upgrade a la vez -> solo se le ofrece la más barata", () => {
    const vencido = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-10), visitas: 0 };
    const lavado = (precio: number): Venta => ({
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(2),
    });
    // Reactivación $17.990 (tramo [0,20]) vs upgrade $21.990 - $2.990 = $19.000.
    const ganaReactivacion = calcularOfertasPlan(vencido, [lavado(2990)], [], config, precios);
    expect(ganaReactivacion.reactivacion?.precio).toBe(17990);
    expect(ganaReactivacion.upgrade).toBeUndefined();
    // Mismo cliente con un lavado más caro: el adicional baja a $12.000 y gana el upgrade.
    const ganaUpgrade = calcularOfertasPlan(vencido, [lavado(9990)], [], config, precios);
    expect(ganaUpgrade.upgrade).toEqual({ precio: 12000 });
    expect(ganaUpgrade.reactivacion).toBeUndefined();
    // Igual con el plan vencido fuera de todo tramo (pagoVencido $21.990).
    const viejo = { id: "c1", plan: PLAN, vencimiento: diasDesdeHoy(-60), visitas: 0 };
    const oferta = calcularOfertasPlan(viejo, [lavado(9990)], [], config, precios);
    expect(oferta.upgrade).toEqual({ precio: 12000 });
    expect(oferta.pagoVencido).toBeUndefined();
  });

  it("cliente de lavado único que NUNCA tuvo plan -> promoPrimerCobroOneclick le da el upgrade", () => {
    // El invariante del que dependen /api/pagos/estado y
    // /api/pagos/oneclick/inscripcion/retorno para abrirse por
    // `planStatus(...).cls === "bad"` y no por `diasVencido(...) !== null`:
    // sin plan `vencimiento` es null, así que diasVencido devuelve null y ese
    // cliente quedaba fuera del primer cobro promocional — inscribía la
    // tarjeta desde "Upgrade a plan" en Mi Cuenta y Transbank le cobraba el
    // plan completo en vez del adicional.
    const sinPlan = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 9990,
      tipo: "Lavado único",
      fecha: horasDesdeAhora(2),
    };
    expect(diasVencido(sinPlan)).toBeNull();
    expect(planStatus(sinPlan).cls).toBe("bad");
    expect(promoPrimerCobroOneclick(calcularOfertasPlan(sinPlan, [venta], [], config, precios))).toEqual({
      tipo: "upgrade_plan",
      monto: 12000,
    });
  });

  it("un 'Lavado único (Web)' canjeado también habilita el primer cobro promocional", () => {
    const sinPlan = { id: "c1", plan: "", vencimiento: null, visitas: 0 };
    const venta: Venta = {
      id: "v1",
      clienteId: "c1",
      patente: "AB1234",
      nombre: "Juan",
      plan: "",
      precio: 9990,
      tipo: "Lavado único (Web)",
      fecha: horasDesdeAhora(2),
      canjeadaEn: horasDesdeAhora(1),
    };
    expect(promoPrimerCobroOneclick(calcularOfertasPlan(sinPlan, [venta], [], config, precios))).toEqual({
      tipo: "upgrade_plan",
      monto: 12000,
    });
    // Sin canjear sigue siendo un vale pendiente: no hay upgrade que cobrar.
    expect(promoPrimerCobroOneclick(calcularOfertasPlan(sinPlan, [{ ...venta, canjeadaEn: undefined }], [], config, precios))).toBeUndefined();
  });

  it("plan vigente sin precio configurado -> no ofrece renovación anticipada (pNormal = 0)", () => {
    const cliente = { id: "c1", plan: "Plan Fantasma", vencimiento: diasDesdeHoy(20), visitas: 0 };
    const oferta = calcularOfertasPlan(cliente, [], [], config, precios);
    expect(oferta.renovacionAnticipada).toBeUndefined();
  });
});

describe("buscarProveedorPorRut", () => {
  const proveedores = [
    { id: "pr1", nombre: "Insumos SpA", rut: "76.543.210-K" },
    { id: "pr2", nombre: "Sin RUT Ltda" },
  ];

  it("encuentra al proveedor sin importar el formato tipeado", () => {
    expect(buscarProveedorPorRut(proveedores, "765432 10k")?.id).toBe("pr1");
    expect(buscarProveedorPorRut(proveedores, "76543210-K")?.id).toBe("pr1");
    expect(buscarProveedorPorRut(proveedores, "76.543.210-K")?.id).toBe("pr1");
  });

  it("no matchea con RUT vacío ni con proveedores sin RUT", () => {
    expect(buscarProveedorPorRut(proveedores, "")).toBeUndefined();
    expect(buscarProveedorPorRut(proveedores, "  ")).toBeUndefined();
    expect(buscarProveedorPorRut(proveedores, "11.111.111-1")).toBeUndefined();
  });
});

describe("esTarjetaWeb / esVentaNuevaWeb", () => {
  it("trata los cobros Oneclick del cliente como tarjeta Transbank, no GETNET", () => {
    // Cobro que el cliente gatilla desde Mi Cuenta contra su tarjeta ya
    // inscrita: upgrade a plan, renovación anticipada o reactivación.
    expect(esTarjetaWeb("Cliente (Oneclick)")).toBe(true);
    expect(esVentaNuevaWeb("Cliente (Oneclick)")).toBe(true);
  });

  it("mantiene el cron Oneclick y Webpay como venta nueva web, y WooCommerce fuera", () => {
    expect(esVentaNuevaWeb("Automático (Oneclick)")).toBe(true);
    expect(esVentaNuevaWeb("Automático (Webpay)")).toBe(true);
    expect(esVentaNuevaWeb("Automático (Web)")).toBe(false);
  });

  it("deja el cobro presencial como tarjeta GETNET", () => {
    expect(esTarjetaWeb("Juan Operador")).toBe(false);
    expect(esTarjetaWeb("")).toBe(false);
  });
});

describe("esVentaAutomatica (qué se puede corregir en el arqueo)", () => {
  it("marca como automática toda venta cobrada por Transbank, venga de donde venga", () => {
    expect(esVentaAutomatica({ creadoPor: "Automático (Webpay)", tipo: "Lavado único" })).toBe(true);
    expect(esVentaAutomatica({ creadoPor: "Automático (Web)", tipo: "Plan nuevo (Web)" })).toBe(true);
    expect(esVentaAutomatica({ creadoPor: "Cliente (Oneclick)", tipo: "Renovación (Web)" })).toBe(true);
  });

  it("marca como automáticos los tipos que nadie tipea, aunque la fila venga sin creadoPor", () => {
    expect(esVentaAutomatica({ tipo: "Plan nuevo (Web)" })).toBe(true);
    expect(esVentaAutomatica({ tipo: "Cupón Venta Empresa" })).toBe(true);
  });

  it("deja editable lo que sí tipeó una persona en el mesón", () => {
    expect(esVentaAutomatica({ creadoPor: "Verónica", tipo: "Lavado único" })).toBe(false);
    expect(esVentaAutomatica({ creadoPor: "Administración", tipo: "Plan nuevo" })).toBe(false);
  });
});

describe("asiento de ajuste del cierre de caja", () => {
  it("da un id por día, y solo ese id pasa como asiento de ajuste", () => {
    expect(idAjusteCierre("2026-08-18")).toBe("mc-ajuste-cierre-2026-08-18");
    // Determinístico: volver a inscribir el ajuste del mismo día reemplaza al
    // anterior en vez de acumular ajustes sueltos.
    expect(idAjusteCierre("2026-08-18")).toBe(idAjusteCierre("2026-08-18"));
    expect(esAjusteCierre(idAjusteCierre("2026-08-18"))).toBe(true);
    expect(esAjusteCierre("mc123456789")).toBe(false);
    expect(esAjusteCierre("mc-venta-v123")).toBe(false);
  });

  it("deja el ajuste de ingreso a túnel y el total real en el texto que se firma", () => {
    const base = { cantidadVentas: 3, totalVentas: 30000, metodosPago: [], efectivoEsperado: 30000 };
    const conAjuste = resumenCierreTexto(
      "2026-08-18",
      { ...base, cantidadIngresos: 45, ajusteIngresos: { cantidad: 2, motivo: "pasaron sin registrar" } },
      false
    );
    expect(conAjuste).toContain("Asiento de ajuste de ingreso a túnel: +2 — pasaron sin registrar");
    expect(conAjuste).toContain("Total real de vehículos: 47");

    const negativo = resumenCierreTexto(
      "2026-08-18",
      { ...base, cantidadIngresos: 45, ajusteIngresos: { cantidad: -1, motivo: "patente repetida" } },
      false
    );
    expect(negativo).toContain("Asiento de ajuste de ingreso a túnel: -1 — patente repetida");
    expect(negativo).toContain("Total real de vehículos: 44");

    // Sin ajuste no se inventa ninguna línea de más.
    expect(resumenCierreTexto("2026-08-18", { ...base, cantidadIngresos: 45 }, false)).not.toContain("ajuste");
  });
});

describe("mesesEntre", () => {
  it("enumera el rango inclusivo cruzando el cambio de año", () => {
    expect(mesesEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("acepta el rango invertido y un solo mes", () => {
    expect(mesesEntre("2026-02", "2025-11")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(mesesEntre("2026-08", "2026-08")).toEqual(["2026-08"]);
  });

  it("corta en 36 columnas para no reventar la tabla del EERR", () => {
    expect(mesesEntre("2000-01", "2026-08")).toHaveLength(36);
  });
});

describe("variacionPorcentual", () => {
  it("compara el primer con el último periodo, sobre el inicial", () => {
    expect(variacionPorcentual([100, 999, 150])).toBe(50);
    expect(variacionPorcentual([200, 150])).toBe(-25);
  });

  it("mide la caída completa aunque el resultado cambie de signo", () => {
    expect(variacionPorcentual([-100, -150])).toBe(-50);
    expect(variacionPorcentual([100, -50])).toBe(-150);
  });

  it("no inventa porcentaje sin base de comparación", () => {
    expect(variacionPorcentual([500])).toBeNull();
    expect(variacionPorcentual([0, 300])).toBeNull();
  });
});

describe("fechaEfectiva", () => {
  const base = {
    id: "m1",
    fecha: "2026-06-10T12:00:00.000Z",
    descripcion: "Venta a 60 días",
    monto: 100000,
    creadoEn: "2026-06-10T12:00:00.000Z",
  };

  it("no considera plata movida lo que sigue pendiente de cobro o de pago", () => {
    expect(fechaEfectiva({ ...base, tipo: "ingreso", estado: "pendiente" })).toBeNull();
    expect(fechaEfectiva({ ...base, tipo: "egreso", estado: "pendiente_pago" })).toBeNull();
    expect(fechaEfectiva({ ...base, tipo: "egreso", estado: "x_rendir" })).toBeNull();
  });

  it("usa la fecha de cobro/pago, no la de la operación", () => {
    const cobrada = { ...base, tipo: "ingreso" as const, estado: "pagado" as const, fechaPago: "2026-08-09T12:00:00.000Z" };
    expect(fechaEfectiva(cobrada)).toBe("2026-08-09T12:00:00.000Z");
    expect(mesKey(fechaEfectiva(cobrada)!)).toBe("2026-08");
  });

  it("cae a la fecha del movimiento cuando se pagó al momento (sin fechaPago)", () => {
    expect(fechaEfectiva({ ...base, tipo: "ingreso", estado: "pagado" })).toBe(base.fecha);
    expect(fechaEfectiva({ ...base, tipo: "egreso", estado: "pagado_efectivo" })).toBe(base.fecha);
  });
});

describe("pasesIncluidos", () => {
  it("el X5 trae 5 pasadas por ciclo", () => {
    expect(pasesIncluidos(PLAN_X5)).toBe(5);
  });

  it("el plan viejo sigue sin tope: su nombre es la marca de grandfathering", () => {
    expect(pasesIncluidos(PLAN_ILIMITADO_LEGACY)).toBeNull();
    expect(pasesIncluidos(null)).toBeNull();
  });
});

describe("planVigente / ilimitadoHastaAlRenovar", () => {
  const enDias = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString();
  };

  it("el que renovó antes de vencer sigue sin tope hasta que termine el mes que ya pagó", () => {
    const cliente = { plan: PLAN_X5, ilimitadoHasta: enDias(10), vencimiento: enDias(40) };
    expect(planVigente(cliente)).toBe(PLAN_ILIMITADO_LEGACY);
    expect(pasesIncluidos(planVigente(cliente))).toBeNull();
  });

  it("pasado ese mes rige el X5 que ya tenía pagado", () => {
    expect(planVigente({ plan: PLAN_X5, ilimitadoHasta: enDias(-1) })).toBe(PLAN_X5);
    expect(planVigente({ plan: PLAN_X5, ilimitadoHasta: null })).toBe(PLAN_X5);
  });

  it("solo arrastra el mes sin tope quien lo tenía pagado y renovó antes de vencer", () => {
    const legacy = { plan: PLAN_ILIMITADO_LEGACY, ilimitadoHasta: null };
    const vigente = enDias(10);
    expect(ilimitadoHastaAlRenovar({ ...legacy, vencimiento: vigente })).toBe(vigente);
    expect(ilimitadoHastaAlRenovar({ ...legacy, vencimiento: enDias(-1) })).toBeNull();
    expect(ilimitadoHastaAlRenovar({ plan: PLAN_X5, ilimitadoHasta: null, vencimiento: enDias(10) })).toBeNull();
    expect(ilimitadoHastaAlRenovar({ plan: undefined, ilimitadoHasta: null, vencimiento: enDias(10) })).toBeNull();
  });

  it("renovar de nuevo dentro del mes de arrastre no lo estira", () => {
    const arrastre = enDias(5);
    expect(ilimitadoHastaAlRenovar({ plan: PLAN_X5, ilimitadoHasta: arrastre, vencimiento: enDias(35) })).toBe(arrastre);
  });
});

describe("pasesRestantes", () => {
  const ingreso = (clienteId: string, fecha: string): Ingreso => ({
    id: "i" + fecha,
    clienteId,
    patente: "AB1234",
    nombre: "Cliente",
    fecha,
    planEstadoAlIngreso: "ok",
  });
  const ahora = new Date("2026-07-05T12:00:00Z");
  const base = { id: "c1", fechaContratacion: "2026-06-12T00:00:00Z" };
  const pasadas = (n: number) =>
    Array.from({ length: n }, (_, i) => ingreso("c1", `2026-06-${String(13 + i).padStart(2, "0")}T09:00:00Z`));

  it("al X5 se le descuentan las pasadas del período y no baja de 0", () => {
    expect(pasesRestantes(pasadas(2), { ...base, plan: PLAN_X5 }, ahora)).toBe(3);
    expect(pasesRestantes(pasadas(5), { ...base, plan: PLAN_X5 }, ahora)).toBe(0);
    expect(pasesRestantes(pasadas(7), { ...base, plan: PLAN_X5 }, ahora)).toBe(0);
  });

  // CSTT90/VKDK74 (ago-2026): plan X5 vigente, fechaContratacion en null y 5
  // pasadas en el mes corrido anterior, todas del período ya vencido. Antes
  // del ancla al vencimiento daban 0 pases y el Operador solo ofrecía
  // "comprar lavado adicional" en vez de "Registrar ingreso".
  it("sin fechaContratacion cuenta el ciclo anclado al vencimiento, no el último mes corrido", () => {
    const hoy = new Date("2026-08-30T15:00:00Z");
    const sinContratacion = { id: "c1", plan: PLAN_X5, fechaContratacion: null, vencimiento: "2026-09-29T15:00:00Z" };
    const previas = ["2026-07-25", "2026-07-30", "2026-08-07", "2026-08-14", "2026-08-21"].map((f) =>
      ingreso("c1", `${f}T15:00:00Z`)
    );
    expect(pasesRestantes(previas, sinContratacion, hoy)).toBe(5);
    expect(pasesRestantes([...previas, ingreso("c1", "2026-08-30T15:00:00Z")], sinContratacion, hoy)).toBe(4);
  });

  it("el plan viejo y el cliente sin plan no tienen tope que contar", () => {
    expect(pasesRestantes(pasadas(9), { ...base, plan: PLAN_ILIMITADO_LEGACY }, ahora)).toBeNull();
    expect(pasesRestantes(pasadas(9), { ...base, plan: undefined }, ahora)).toBeNull();
  });
});
