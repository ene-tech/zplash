import { describe, expect, it } from "vitest";
import type { Cliente, Ingreso, Venta } from "@/types";
import {
  construirEmbudo,
  construirRecorrido,
  clasificarConversacionesSinFicha,
  clienteEnSegmento,
  contarSegmentos,
  estadoPalanca,
  etapaCliente,
  etapaDePalanca,
  etapaEnFecha,
  type ConversacionSinFicha,
} from "./recorrido";
import { interesDeMensajes, opcionDeTexto } from "./whatsapp";

// El corazón del módulo es etapaEnFecha: no hay historial de estados en la
// base, así que la etapa pasada se reconstruye desde las ventas de plan. Si
// esto se corre, el embudo atribuye los rescates a la etapa equivocada y la
// conclusión de negocio ("el correo de vencidos funciona") sale al revés.

const ISO = (fecha: string) => `${fecha}T12:00:00.000Z`;

describe("etapaEnFecha", () => {
  it("sin venta de plan previa y sin haber pasado nunca: registrado que nunca vino", () => {
    expect(etapaEnFecha(ISO("2026-06-10"), undefined, false)).toBe("nunca_vino");
  });

  it("sin venta de plan previa pero ya había lavado: lava sin plan", () => {
    expect(etapaEnFecha(ISO("2026-06-10"), undefined, true)).toBe("lavado_suelto");
  });

  it("renovó de sobra antes de vencer: estaba con el plan al día", () => {
    // Compró el 01-jun, le vencía el 01-jul, renovó el 10-jun: 21 días antes.
    expect(etapaEnFecha(ISO("2026-06-10"), ISO("2026-06-01"), true)).toBe("plan_activo");
  });

  it("renovó dentro de la ventana de aviso: estaba por vencer", () => {
    // Le vencía el 01-jul y renovó el 28-jun, 3 días antes.
    expect(etapaEnFecha(ISO("2026-06-28"), ISO("2026-06-01"), true)).toBe("por_vencer");
  });

  it("volvió 10 días después de vencido: rescate en caliente", () => {
    expect(etapaEnFecha(ISO("2026-07-11"), ISO("2026-06-01"), true)).toBe("vencido_reciente");
  });

  it("volvió a los dos meses: venía de vencido frío", () => {
    expect(etapaEnFecha(ISO("2026-09-01"), ISO("2026-06-01"), true)).toBe("vencido_frio");
  });
});

describe("etapaCliente", () => {
  const base = { vencimiento: null, visitas: 0 };

  it("separa al que nunca vino del que lava suelto", () => {
    expect(etapaCliente(base)).toBe("nunca_vino");
    expect(etapaCliente({ ...base, visitas: 4 })).toBe("lavado_suelto");
  });

  it("un vencimiento lejano en el futuro es plan al día", () => {
    const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString();
    expect(etapaCliente({ vencimiento: enUnMes, visitas: 3 })).toBe("plan_activo");
  });

  it("distingue el vencido rescatable del frío", () => {
    const hace10 = new Date(Date.now() - 10 * 86400000).toISOString();
    const hace90 = new Date(Date.now() - 90 * 86400000).toISOString();
    expect(etapaCliente({ vencimiento: hace10, visitas: 3 })).toBe("vencido_reciente");
    expect(etapaCliente({ vencimiento: hace90, visitas: 3 })).toBe("vencido_frio");
  });
});

// Cliente mínimo: el embudo solo mira vencimiento/visitas para la foto de hoy.
const cliente = (id: string, vencimiento: string | null, visitas = 0): Cliente =>
  ({ id, nombre: id, patente: id, vencimiento, visitas, origen: "LOCAL", creadoEn: ISO("2026-01-01") }) as Cliente;

const venta = (id: string, clienteId: string, fecha: string, tipo = "Renovación preferencial"): Venta =>
  ({ id, clienteId, patente: clienteId, nombre: clienteId, plan: "Plan X5", precio: 21990, tipo, fecha }) as Venta;

const ingreso = (id: string, clienteId: string, fecha: string): Ingreso =>
  ({ id, clienteId, patente: clienteId, nombre: clienteId, fecha, planEstadoAlIngreso: "ok" }) as Ingreso;

describe("construirEmbudo", () => {
  // Un cliente que compró el 01-may, se dejó vencer el 01-jun y recién volvió
  // el 20-jul: la venta de rescate tiene que quedar contada en "vencido hace
  // poco" (de donde salió) aunque su ficha hoy esté al día.
  const enUnMes = new Date(Date.now() + 25 * 86400000).toISOString();
  const clientes = [cliente("RESCATADO", enUnMes, 5)];
  const ventas = [venta("v1", "RESCATADO", ISO("2026-05-01")), venta("v2", "RESCATADO", ISO("2026-07-20"))];
  const ingresos = [ingreso("i1", "RESCATADO", ISO("2026-05-05"))];

  const filas = construirEmbudo({
    clientes,
    ventas,
    ingresos,
    comunicaciones: [
      // Correo mandado el 10-jul, con el cliente vencido hace 39 días: frío.
      { clienteId: "RESCATADO", canal: "correo", direccion: "saliente", fecha: ISO("2026-07-10") },
      // WhatsApp que contestó el 19-jul, un día antes de volver a comprar.
      { clienteId: "RESCATADO", canal: "whatsapp", direccion: "entrante", fecha: ISO("2026-07-19") },
    ],
    desde: "2026-07-01",
    hasta: "2026-07-31",
  });

  const fila = (etapa: string) => filas.find((f) => f.etapa === etapa)!;

  it("cuenta la ficha en la etapa de hoy", () => {
    expect(fila("plan_activo").clientes.map((c) => c.id)).toEqual(["RESCATADO"]);
    expect(fila("vencido_frio").clientes).toEqual([]);
  });

  it("atribuye la venta a la etapa desde la que se convirtió, no a la de hoy", () => {
    expect(fila("vencido_frio").compraronPlan).toBe(1);
    expect(fila("plan_activo").compraronPlan).toBe(0);
  });

  it("solo cuenta las ventas del período pedido", () => {
    // La venta de mayo queda fuera del rango julio; nadie más suma.
    expect(filas.reduce((s, f) => s + f.compraronPlan, 0)).toBe(1);
  });

  it("atribuye cada mensaje a la etapa en la que estaba el cliente ese día", () => {
    expect(fila("vencido_frio").comunicaciones).toEqual({ waSalientes: 0, waEntrantes: 1, correos: 1 });
    expect(fila("plan_activo").comunicaciones).toEqual({ waSalientes: 0, waEntrantes: 0, correos: 0 });
  });
});

describe("construirRecorrido", () => {
  it("mezcla ventas, pasadas, cobros y mensajes en una sola línea, lo más nuevo primero", () => {
    const eventos = construirRecorrido({
      clienteId: "ABCD12",
      ventas: [venta("v1", "ABCD12", ISO("2026-06-01")), venta("v2", "OTRO", ISO("2026-06-02"))],
      ingresos: [ingreso("i1", "ABCD12", ISO("2026-06-05"))],
      comunicaciones: {
        correos: [{ id: "c1", fecha: ISO("2026-06-28"), asunto: "Tu plan vence", estado: "enviado" }],
        whatsapp: [{ id: "w1", fecha: ISO("2026-06-29"), texto: "gracias", direccion: "entrante" }],
        cobros: [{ id: "co1", fecha: ISO("2026-07-01"), monto: 21990, estado: "rechazada", cicloYm: "2026-07" }],
      },
    });

    expect(eventos.map((e) => e.id)).toEqual(["cobro-co1", "wa-w1", "correo-c1", "ingreso-i1", "venta-v1"]);
    // La venta de otro cliente no se cuela.
    expect(eventos.some((e) => e.id === "venta-v2")).toBe(false);
  });

  it("marca el cobro rechazado como error y le pone la etapa del momento", () => {
    const eventos = construirRecorrido({
      clienteId: "ABCD12",
      ventas: [venta("v1", "ABCD12", ISO("2026-06-01"))],
      ingresos: [],
      comunicaciones: {
        correos: [],
        whatsapp: [],
        cobros: [{ id: "co1", fecha: ISO("2026-07-01"), monto: 21990, estado: "rechazada", cicloYm: "2026-07" }],
      },
    });

    const cobro = eventos[0];
    expect(cobro.estado).toBe("error");
    // El 01-jul le vencía justo: el cobro sale con el cliente todavía por vencer.
    expect(cobro.etapa).toBe("por_vencer");
  });
});

// El estado de la palanca es lo que distingue "esta etapa está cubierta" de
// "esta etapa parece cubierta". Una regla marcada activa que nunca disparó se
// ve igual que una que funciona en la pantalla de Reglas — acá no.
describe("estadoPalanca", () => {
  const base = { activa: true, disparosTotales: 100, disparosPeriodo: 20, erroresPeriodo: 0 };

  it("apagada gana sobre cualquier otra señal", () => {
    expect(estadoPalanca({ ...base, activa: false })).toBe("apagada");
  });

  it("activa pero sin un solo disparo en su historia: muda", () => {
    expect(estadoPalanca({ ...base, disparosTotales: 0, disparosPeriodo: 0 })).toBe("muda");
  });

  it("manda pero un 10% o más termina en error: rebota", () => {
    expect(estadoPalanca({ ...base, erroresPeriodo: 2 })).toBe("rebota");
    expect(estadoPalanca({ ...base, erroresPeriodo: 1 })).toBe("andando");
  });

  it("sin disparos en el período no se marca como que rebota", () => {
    // División por cero: una regla que no disparó este mes no rebota, está andando.
    expect(estadoPalanca({ ...base, disparosPeriodo: 0, erroresPeriodo: 0 })).toBe("andando");
  });
});

describe("etapaDePalanca", () => {
  it("el aviso de vencimiento actúa sobre 'por vencer'", () => {
    expect(etapaDePalanca({ tipoEvento: "plan_proximo_vencer" })).toBe("por_vencer");
  });

  it("el correo de plan vencido cae en frío o en caliente según sus días de espera", () => {
    expect(etapaDePalanca({ tipoEvento: "plan_vencido", condicionDiasDespuesVencimiento: 7 })).toBe("vencido_reciente");
    expect(etapaDePalanca({ tipoEvento: "plan_vencido", condicionDiasDespuesVencimiento: 45 })).toBe("vencido_frio");
  });

  it("el cobro fallido actúa sobre el que TIENE plan: es de ahí que se cae", () => {
    expect(etapaDePalanca({ tipoEvento: "cobro_fallido" })).toBe("plan_activo");
  });

  it("separa la confirmación de plan de la invitación tras un lavado suelto", () => {
    expect(etapaDePalanca({ tipoEvento: "venta_creada", condicionTipoVenta: "Plan nuevo" })).toBe("plan_activo");
    expect(etapaDePalanca({ tipoEvento: "venta_creada_presencial", condicionTipoVenta: "Lavado único" })).toBe("lavado_suelto");
  });

  it("lo que no es palanca del embudo queda fuera", () => {
    expect(etapaDePalanca({ tipoEvento: "envio_manual" })).toBeNull();
    expect(etapaDePalanca({ tipoEvento: "cambio_patente" })).toBeNull();
  });
});

// El segmento es lo que decide QUÉ ofrecerle dentro de su etapa. El que más
// importa acertar es "autopago": a ese no hay que mandarle recordatorio de
// vencimiento, y cuenta igual si el cobro automático es el Oneclick propio o
// la suscripción vieja de WooCommerce.
describe("clienteEnSegmento", () => {
  const sinAutopago = new Set<string>();
  const conAutopago = new Set(["ABCD12"]);
  const base = { id: "c1", patente: "ABCD12", plan: "Plan X5", origen: "LOCAL" } as Cliente;

  it("distingue el X5 del ilimitado viejo por el plan que rige HOY", () => {
    expect(clienteEnSegmento(base, "x5", sinAutopago)).toBe(true);
    expect(clienteEnSegmento(base, "ilimitado", sinAutopago)).toBe(false);

    // Arrastra el mes sin tope: su plan dice X5 pero el vigente es el viejo.
    const enUnaSemana = new Date(Date.now() + 7 * 86400000).toISOString();
    const migrando = { ...base, ilimitadoHasta: enUnaSemana } as Cliente;
    expect(clienteEnSegmento(migrando, "ilimitado", sinAutopago)).toBe(true);
    expect(clienteEnSegmento(migrando, "x5", sinAutopago)).toBe(false);
  });

  it("la suscripción vieja de WooCommerce cuenta como cobro automático", () => {
    expect(clienteEnSegmento(base, "autopago", sinAutopago)).toBe(false);
    expect(clienteEnSegmento(base, "autopago", conAutopago)).toBe(true);
    const woo = { ...base, renovacionAutoWooDesde: "2026-01-01T00:00:00.000Z" } as Cliente;
    expect(clienteEnSegmento(woo, "autopago", sinAutopago)).toBe(true);
    expect(clienteEnSegmento(woo, "sin_autopago", sinAutopago)).toBe(false);
  });

  it("sin origen seteado el cliente es del local, no de la web", () => {
    expect(clienteEnSegmento({ ...base, origen: undefined } as Cliente, "local", sinAutopago)).toBe(true);
    expect(clienteEnSegmento({ ...base, origen: undefined } as Cliente, "web", sinAutopago)).toBe(false);
  });

  it("sin plan es su propio segmento, no 'otro plan'", () => {
    const pelado = { ...base, plan: "" } as Cliente;
    expect(clienteEnSegmento(pelado, "sin_plan", sinAutopago)).toBe(true);
    expect(clienteEnSegmento(pelado, "otro_plan", sinAutopago)).toBe(false);
  });
});

describe("contarSegmentos", () => {
  it("cada cliente cae en exactamente un segmento por grupo", () => {
    const clientes = [
      { id: "a", patente: "AAAA11", plan: "Plan X5", origen: "WEB" },
      { id: "b", patente: "BBBB22", plan: "", origen: "LOCAL" },
      { id: "c", patente: "CCCC33", plan: "Plan X5", origen: "LOCAL" },
    ] as Cliente[];
    const conteo = contarSegmentos(clientes, new Set(["AAAA11"]));

    expect(conteo.x5 + conteo.ilimitado + conteo.otro_plan + conteo.sin_plan).toBe(3);
    expect(conteo.autopago + conteo.sin_autopago).toBe(3);
    expect(conteo.web + conteo.local).toBe(3);
    expect(conteo.autopago).toBe(1);
    expect(conteo.web).toBe(1);
  });
});

// El cruce que decide si un número de WhatsApp es un prospecto o un cliente
// mal enlazado. Si se equivoca hacia "prospecto", el listado comercial manda a
// contactar gente que ya es cliente; si se equivoca hacia el otro lado, el
// prospecto desaparece de la lista.
describe("clasificarConversacionesSinFicha", () => {
  const conv = (telefono: string, extra: Partial<ConversacionSinFicha> = {}): ConversacionSinFicha => ({
    conversacionId: telefono,
    telefono,
    primerContacto: ISO("2026-08-01"),
    ultimoMensajeEn: ISO("2026-08-10"),
    mensajes: 4,
    escribio: 2,
    interes: null,
    ...extra,
  });

  const clientes = [
    // Ficha vieja migrada sin el "+569" canónico: por eso el webhook no pudo
    // enlazarla al crear la conversación, aunque es la misma persona.
    { id: "c1", nombre: "Ana", patente: "AAAA11", telefono: "997639764" },
    { id: "c2", nombre: "Beto", patente: "BBBB22", telefono: "+56911112222" },
  ] as Cliente[];

  it("reconoce al cliente cuyo teléfono estaba guardado sin el +569", () => {
    const { prospectos, sinVincular } = clasificarConversacionesSinFicha([conv("+56997639764")], clientes);
    expect(prospectos).toEqual([]);
    expect(sinVincular).toHaveLength(1);
    expect(sinVincular[0].cliente.id).toBe("c1");
  });

  it("un número que no existe en la base queda como prospecto", () => {
    const { prospectos, sinVincular } = clasificarConversacionesSinFicha([conv("+56955550000")], clientes);
    expect(sinVincular).toEqual([]);
    expect(prospectos.map((p) => p.telefono)).toEqual(["+56955550000"]);
  });

  it("ordena primero al que dejó un flujo a medias, después por cuánto escribió", () => {
    const { prospectos } = clasificarConversacionesSinFicha(
      [
        conv("+56955550001", { escribio: 9 }),
        conv("+56955550002", { escribio: 1, flujoAbandonado: { tipo: "registro_descuento", paso: "nombre" } }),
        conv("+56955550003", { escribio: 4 }),
      ],
      clientes
    );
    expect(prospectos.map((p) => p.telefono)).toEqual(["+56955550002", "+56955550001", "+56955550003"]);
  });
});

describe("interesDeMensajes", () => {
  it("clasifica por la opción del menú que tocó", () => {
    expect(interesDeMensajes(["hola", "1"])).toBe("precios");
    expect(interesDeMensajes(["4"])).toBe("humano");
    expect(interesDeMensajes(["descuento"])).toBe("descuento");
  });

  it("con varias opciones se queda con la de más intención de compra, no con la última", () => {
    // Preguntó horario y después pidió el descuento: es un prospecto de
    // descuento, y así se ordena la lista de trabajo.
    expect(interesDeMensajes(["3", "5"])).toBe("descuento");
    expect(interesDeMensajes(["5", "3"])).toBe("descuento");
    expect(interesDeMensajes(["4", "1"])).toBe("precios");
  });

  it("sin ninguna opción conocida no inventa un interés", () => {
    expect(interesDeMensajes(["hola", "buenas tardes"])).toBeNull();
    expect(interesDeMensajes([])).toBeNull();
  });
});

describe("opcionDeTexto", () => {
  it("reconoce la opcion dentro de una frase, no solo el texto exacto", () => {
    // Los tres casos que hasta ago-2026 caian al menu generico: la palabra
    // con la patente pegada, la frase larga y los links que la propia web
    // abre con el texto ya escrito.
    expect(opcionDeTexto("descuento AB1234")).toBe("descuento");
    expect(opcionDeTexto("quiero hablar con una persona")).toBe("humano");
    expect(opcionDeTexto("Hola, quiero gestionar mi renovacion automatica")).toBe("renovacion_auto");
    expect(opcionDeTexto("Hola, quiero agendar el servicio \"Lavado Completo Detailing\" para mi auto")).toBe("agendar");
  });

  it("le da lo mismo la tilde y la puntuacion", () => {
    expect(opcionDeTexto("Hola, quiero gestionar mi renovacion automatica")).toBe(
      opcionDeTexto("renovacion automatica")
    );
    expect(opcionDeTexto("ubicacion?")).toBe("horario");
  });

  it("los numeros valen solo si el mensaje ES el numero", () => {
    expect(opcionDeTexto("1")).toBe("precios");
    expect(opcionDeTexto(" 4 ")).toBe("humano");
    // Si "1" matcheara como palabra suelta, pedir un lavado abriria la lista
    // de precios en vez de caer al menu.
    expect(opcionDeTexto("quiero 1 lavado")).toBeNull();
  });

  it("no matchea una opcion metida adentro de otra palabra", () => {
    expect(opcionDeTexto("un trato personalizado")).toBeNull();
    expect(opcionDeTexto("hola")).toBeNull();
    expect(opcionDeTexto("")).toBeNull();
  });
});
