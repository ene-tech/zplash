import type { Cliente, Ingreso, Venta } from "@/types";
import { DIAS_AVISO_VENCIMIENTO, diasVencido, indexarClientesPorTelefono, planStatus } from "./clientes";
import { inRange, sumarMesesFecha } from "./fechas";
import { PLAN_ILIMITADO_LEGACY, PLAN_X5, planVigente } from "./precios";
import { formatTelefono } from "./validadores";
import type { InteresBot } from "./whatsapp";
import { TIPOS_VENTA_PLAN } from "./ventas";

// Recorrido del cliente: las etapas por las que pasa desde que existe la
// ficha hasta que se le enfría el plan, y qué comunicación recibe en cada
// una. No hay tabla de "etapa": se deriva de datos que ya existen
// (clientes.vencimiento, clientes.visitas, ventas de plan e ingresos), así
// que no hay nada que backfillear ni que mantener sincronizado — el precio es
// que la etapa PASADA se reconstruye, ver etapaEnFecha.

export type EtapaId = "nunca_vino" | "lavado_suelto" | "plan_activo" | "por_vencer" | "vencido_reciente" | "vencido_frio";

/**
 * Corte entre "todavía se rescata" y "vencido frío". 30 días es el mismo eje
 * que ya usa la promoción de reactivación (ver precioReactivacionVencido en
 * @/lib/helpers/precios): pasado ese punto el cliente deja de responder al
 * recordatorio y pasa a necesitar una oferta.
 */
export const DIAS_VENCIDO_RECIENTE = 30;

export const ETAPAS: { id: EtapaId; label: string; desc: string }[] = [
  { id: "nunca_vino", label: "Registrado, nunca vino", desc: "Tiene ficha, no tiene plan y nunca pasó por el túnel." },
  { id: "lavado_suelto", label: "Lava sin plan", desc: "Ya vino a lavar pagando suelto, todavía no contrata plan." },
  { id: "plan_activo", label: "Plan al día", desc: `Plan vigente con más de ${DIAS_AVISO_VENCIMIENTO} días por delante.` },
  { id: "por_vencer", label: "Por vencer", desc: `Le quedan ${DIAS_AVISO_VENCIMIENTO} días o menos de plan.` },
  {
    id: "vencido_reciente",
    label: "Vencido hace poco",
    desc: `Se le venció hace ${DIAS_VENCIDO_RECIENTE} días o menos: todavía se rescata.`,
  },
  { id: "vencido_frio", label: "Vencido frío", desc: `Se le venció hace más de ${DIAS_VENCIDO_RECIENTE} días.` },
];

export const ETIQUETA_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.label])) as Record<EtapaId, string>;

/**
 * Etapa en la que está el cliente HOY. Se apoya en planStatus (misma
 * definición de Vigente/Por vencer/Vencido que usa el resto de la app, hora
 * de Chile incluida) y solo agrega los dos cortes que planStatus no hace:
 * separar al que nunca vino del que sí lava sin plan, y al vencido reciente
 * del frío.
 */
export function etapaCliente(c: Pick<Cliente, "vencimiento" | "visitas">): EtapaId {
  const { label } = planStatus(c);
  if (label === "Sin plan") return (c.visitas || 0) > 0 ? "lavado_suelto" : "nunca_vino";
  if (label === "Vigente") return "plan_activo";
  if (label === "Por vencer") return "por_vencer";
  return (diasVencido(c) ?? 0) <= DIAS_VENCIDO_RECIENTE ? "vencido_reciente" : "vencido_frio";
}

/**
 * Etapa en la que estaba el cliente en una fecha PASADA — lo que hace falta
 * para poder decir "este correo salió cuando estaba por vencer" o "esta venta
 * la hizo estando vencido hace 40 días".
 *
 * `clientes.vencimiento` guarda un solo valor, el de hoy: el vencimiento que
 * el cliente tenía en cualquier otro momento hay que reconstruirlo, y el
 * único rastro que quedó de eso son sus ventas de plan. De ahí el supuesto
 * central: cada venta de plan le dejaba el vencimiento un mes más adelante
 * (el ciclo real, mismo criterio que periodoPlan). Es una aproximación —
 * ignora los vencimientos movidos a mano desde la ficha y el mes regalado del
 * ilimitado viejo (ver ilimitadoHasta en @/db/schema/clientes) — pero es la
 * única disponible sin una tabla de historial de estados, y se equivoca por
 * días, no por etapas enteras.
 *
 * Sin venta de plan previa el cliente nunca había contratado, y lo único que
 * distingue las dos etapas iniciales es si ya había pasado por el túnel.
 */
export function etapaEnFecha(fecha: string, fechaVentaPlanPrevia: string | undefined, teniaIngresoPrevio: boolean): EtapaId {
  if (!fechaVentaPlanPrevia) return teniaIngresoPrevio ? "lavado_suelto" : "nunca_vino";
  const vencia = sumarMesesFecha(new Date(fechaVentaPlanPrevia), 1);
  const dias = Math.round((new Date(fecha).getTime() - vencia.getTime()) / 86400000);
  if (dias > DIAS_VENCIDO_RECIENTE) return "vencido_frio";
  if (dias > 0) return "vencido_reciente";
  if (dias >= -DIAS_AVISO_VENCIMIENTO) return "por_vencer";
  return "plan_activo";
}

/** Una comunicación con el cliente, reducida a lo que el embudo necesita contar. */
export interface ComunicacionEtapa {
  clienteId: string;
  canal: "whatsapp" | "correo";
  direccion: "entrante" | "saliente";
  fecha: string;
}

/**
 * Lo mismo, pero como sale de la base: WhatsApp puede llegar sin `clienteId`
 * y solo con el número (ver listarComunicacionesPeriodo en
 * @/lib/dataAccess/recorrido). Vive acá y no en dataAccess porque el embudo
 * se arma en el navegador, y ese archivo lleva `import "server-only"`.
 */
export interface ComunicacionPeriodo {
  clienteId?: string;
  telefono?: string;
  canal: "whatsapp" | "correo";
  direccion: "entrante" | "saliente";
  fecha: string;
}

/**
 * Le pone dueño a cada comunicación que llegó sin ficha enlazada: un hilo de
 * WhatsApp guarda `cliente_id` solo si el número calzaba exacto contra
 * `clientes.telefono` al crearse (ver listarComunicacionesPeriodo en
 * @/lib/dataAccess/recorrido), así que el resto se resuelve acá con el mismo
 * índice normalizado que usa Mensajes WhatsApp.
 *
 * Un número con dos autos son dos fichas (los clientes se guardan por
 * patente): el mensaje se le carga a la primera y no a las dos, porque es UN
 * mensaje — duplicarlo inflaría el conteo de la etapa.
 */
export function resolverComunicaciones(filas: ComunicacionPeriodo[], clientes: Cliente[]): ComunicacionEtapa[] {
  const porTelefono = indexarClientesPorTelefono(clientes);
  const resueltas: ComunicacionEtapa[] = [];
  for (const f of filas) {
    const clienteId = f.clienteId || (f.telefono ? porTelefono.get(formatTelefono(f.telefono))?.[0]?.id : undefined);
    if (!clienteId) continue;
    resueltas.push({ clienteId, canal: f.canal, direccion: f.direccion, fecha: f.fecha });
  }
  return resueltas;
}

export interface ContadorComunicaciones {
  waSalientes: number;
  waEntrantes: number;
  correos: number;
}

export interface FilaEtapa {
  etapa: EtapaId;
  label: string;
  desc: string;
  /** Clientes que están HOY en esta etapa. */
  clientes: Cliente[];
  /** Ventas de plan del período hechas por alguien que estaba en esta etapa. */
  compraronPlan: number;
  /** Mensajes del período enviados/recibidos mientras el cliente estaba en esta etapa. */
  comunicaciones: ContadorComunicaciones;
}

/** Última fecha (epoch ms) estrictamente anterior a `corte`, o undefined. */
function ultimaAntesDe(fechas: number[], corte: number): number | undefined {
  let mejor: number | undefined;
  for (const f of fechas) if (f < corte && (mejor === undefined || f > mejor)) mejor = f;
  return mejor;
}

/**
 * El embudo completo: una fila por etapa con cuánta gente hay hoy, qué se le
 * comunicó en el período y cuántas ventas de plan salieron de ahí.
 *
 * Ojo con la mezcla de tiempos, que es a propósito: `clientes` es una foto de
 * HOY, mientras que `compraronPlan` y `comunicaciones` se atribuyen a la
 * etapa en la que estaba el cliente EN EL MOMENTO de cada evento (ver
 * etapaEnFecha). Es lo que hace que la tabla se lea como un embudo y no como
 * seis listas sueltas: el que se rescató este mes suma su venta en "vencido"
 * (de donde salió) y su ficha en "plan al día" (donde está ahora).
 */
export function construirEmbudo(opts: {
  clientes: Cliente[];
  ventas: Venta[];
  ingresos: Ingreso[];
  comunicaciones: ComunicacionEtapa[];
  desde: string;
  hasta: string;
}): FilaEtapa[] {
  const { clientes, ventas, ingresos, comunicaciones, desde, hasta } = opts;

  // Índices por cliente en una sola pasada: sus ventas de plan (para
  // reconstruir el vencimiento que tenía en cualquier fecha) y su primer
  // ingreso (lo único que separa "nunca vino" de "lava sin plan").
  const ventasPlan = new Map<string, number[]>();
  for (const v of ventas) {
    if (!v.clienteId || !TIPOS_VENTA_PLAN.has(v.tipo)) continue;
    const t = new Date(v.fecha).getTime();
    const previas = ventasPlan.get(v.clienteId);
    if (previas) previas.push(t);
    else ventasPlan.set(v.clienteId, [t]);
  }
  const primerIngreso = new Map<string, number>();
  for (const i of ingresos) {
    if (!i.clienteId) continue;
    const t = new Date(i.fecha).getTime();
    const previo = primerIngreso.get(i.clienteId);
    if (previo === undefined || t < previo) primerIngreso.set(i.clienteId, t);
  }

  const etapaDe = (clienteId: string, fecha: string): EtapaId => {
    const corte = new Date(fecha).getTime();
    const previa = ultimaAntesDe(ventasPlan.get(clienteId) || [], corte);
    const ingreso = primerIngreso.get(clienteId);
    return etapaEnFecha(
      fecha,
      previa === undefined ? undefined : new Date(previa).toISOString(),
      ingreso !== undefined && ingreso < corte
    );
  };

  const filas: FilaEtapa[] = ETAPAS.map((e) => ({
    etapa: e.id,
    label: e.label,
    desc: e.desc,
    clientes: [],
    compraronPlan: 0,
    comunicaciones: { waSalientes: 0, waEntrantes: 0, correos: 0 },
  }));
  const porEtapa = new Map(filas.map((f) => [f.etapa, f]));

  for (const c of clientes) porEtapa.get(etapaCliente(c))?.clientes.push(c);

  for (const v of ventas) {
    if (!v.clienteId || !TIPOS_VENTA_PLAN.has(v.tipo) || !inRange(v.fecha, desde, hasta)) continue;
    const fila = porEtapa.get(etapaDe(v.clienteId, v.fecha));
    if (fila) fila.compraronPlan++;
  }

  for (const m of comunicaciones) {
    const fila = porEtapa.get(etapaDe(m.clienteId, m.fecha));
    if (!fila) continue;
    if (m.canal === "correo") fila.comunicaciones.correos++;
    else if (m.direccion === "entrante") fila.comunicaciones.waEntrantes++;
    else fila.comunicaciones.waSalientes++;
  }

  return filas;
}

// --- Etapa cero: escribió por WhatsApp y nunca dejó ficha ---

/**
 * Un número que entró por WhatsApp sin quedar enlazado a una ficha, con lo
 * que hizo en la conversación. Sale de listarConversacionesSinFicha
 * (@/lib/dataAccess/recorrido).
 */
export interface ConversacionSinFicha {
  conversacionId: string;
  telefono: string;
  nombreContacto?: string;
  primerContacto: string;
  ultimoMensajeEn: string;
  mensajes: number;
  /** Cuántos mandó él: es la medida de interés real, no el total del hilo. */
  escribio: number;
  interes: InteresBot | null;
  /** Flujo del bot que dejó a medias — ver flowState en @/db/schema/whatsapp. */
  flujoAbandonado?: { tipo: string; paso: string };
}

/**
 * Separa a los que de verdad no existen en la base de los que sí tienen ficha
 * pero con el número mal enlazado.
 *
 * La distinción importa porque la acción es opuesta: al prospecto hay que
 * venderle, y al mal enlazado hay que arreglarle el dato — su conversación
 * hoy no le suma a ninguna etapa del embudo, así que aparece como si nadie le
 * hablara. El cruce usa indexarClientesPorTelefono, la misma normalización de
 * Mensajes WhatsApp: `conversaciones_whatsapp.cliente_id` se llena comparando
 * el número CRUDO contra `clientes.telefono` (ver buscarOCrearConversacion),
 * y por eso a las fichas viejas migradas sin el "+569" canónico se les escapa.
 */
export function clasificarConversacionesSinFicha(
  sinFicha: ConversacionSinFicha[],
  clientes: Cliente[]
): { prospectos: ConversacionSinFicha[]; sinVincular: { conversacion: ConversacionSinFicha; cliente: Cliente }[] } {
  const porTelefono = indexarClientesPorTelefono(clientes);
  const prospectos: ConversacionSinFicha[] = [];
  const sinVincular: { conversacion: ConversacionSinFicha; cliente: Cliente }[] = [];

  for (const c of sinFicha) {
    const cliente = porTelefono.get(formatTelefono(c.telefono))?.[0];
    if (cliente) sinVincular.push({ conversacion: c, cliente });
    else prospectos.push(c);
  }

  // Más adentro primero: el que escribió más veces es con el que más barato
  // sale cerrar, y el que dejó un flujo a medias ya había dicho que sí.
  prospectos.sort((a, b) => Number(!!b.flujoAbandonado) - Number(!!a.flujoAbandonado) || b.escribio - a.escribio);
  return { prospectos, sinVincular };
}

// --- Segmentos: con qué se le entra al cliente dentro de su etapa ---

/**
 * Cortes transversales a la etapa. La etapa dice CUÁNDO hablarle; el segmento
 * dice QUÉ ofrecerle: al del ilimitado viejo hay que migrarlo, al que lava
 * suelto contratarle, al que ya tiene cobro automático no hay que
 * recordarle nada, y al que llegó por el local se le vende distinto que al
 * que compró por la web.
 */
export type SegmentoId = "x5" | "ilimitado" | "otro_plan" | "sin_plan" | "autopago" | "sin_autopago" | "web" | "local";

export type GrupoSegmento = "plan" | "cobro" | "origen";

export const SEGMENTOS: { id: SegmentoId; label: string; grupo: GrupoSegmento; ayuda: string }[] = [
  { id: "x5", label: PLAN_X5, grupo: "plan", ayuda: "Ya está en el plan que se vende hoy." },
  { id: "ilimitado", label: "Ilimitado viejo", grupo: "plan", ayuda: "Arrastra el mes sin tope: el candidato a migrar al X5." },
  { id: "otro_plan", label: "Otro plan", grupo: "plan", ayuda: "Tiene un plan que no es ni el X5 ni el ilimitado viejo." },
  { id: "sin_plan", label: "Sin plan", grupo: "plan", ayuda: "No tiene plan: es contratación, no renovación." },
  { id: "autopago", label: "Con cobro automático", grupo: "cobro", ayuda: "Renueva solo (Oneclick o la suscripción vieja de WooCommerce): no necesita recordatorio." },
  { id: "sin_autopago", label: "Sin cobro automático", grupo: "cobro", ayuda: "Cada renovación depende de que él se acuerde: acá sirve el recordatorio y la inscripción de tarjeta." },
  { id: "web", label: "Origen web", grupo: "origen", ayuda: "Se dio de alta por la web." },
  { id: "local", label: "Origen local", grupo: "origen", ayuda: "Lo dio de alta el mesón." },
];

/**
 * `patentesAutopago` son las que tienen una suscripción Oneclick activa (va
 * por patente, no por cliente: la tarjeta se inscribe por auto). Se suma
 * `renovacionAutoWooDesde`, que es el cobro automático del sistema viejo y
 * cuenta igual para el negocio — al cliente le da lo mismo quién le cobra.
 */
export function clienteEnSegmento(c: Cliente, segmento: SegmentoId, patentesAutopago: Set<string>): boolean {
  const plan = planVigente(c);
  const conAutopago = patentesAutopago.has(c.patente) || !!c.renovacionAutoWooDesde;
  switch (segmento) {
    case "x5":
      return plan === PLAN_X5;
    case "ilimitado":
      return plan === PLAN_ILIMITADO_LEGACY;
    case "otro_plan":
      return !!plan && plan !== PLAN_X5 && plan !== PLAN_ILIMITADO_LEGACY;
    case "sin_plan":
      return !plan;
    case "autopago":
      return conAutopago;
    case "sin_autopago":
      return !conAutopago;
    case "web":
      return (c.origen || "LOCAL") === "WEB";
    case "local":
      return (c.origen || "LOCAL") === "LOCAL";
  }
}

/** Cuántos clientes de esta etapa caen en cada segmento. Un cliente cae en uno por grupo. */
export function contarSegmentos(clientes: Cliente[], patentesAutopago: Set<string>): Record<SegmentoId, number> {
  const conteo = Object.fromEntries(SEGMENTOS.map((s) => [s.id, 0])) as Record<SegmentoId, number>;
  for (const c of clientes) {
    for (const s of SEGMENTOS) if (clienteEnSegmento(c, s.id, patentesAutopago)) conteo[s.id]++;
  }
  return conteo;
}

// --- Palancas: qué acción automática actúa sobre cada etapa ---

/** Cuánto disparó una regla, tal como lo cuenta contarDisparosPorRegla. */
export interface ConteoDisparos {
  reglaId: string;
  disparosTotales: number;
  disparosPeriodo: number;
  erroresPeriodo: number;
  ultimoDisparo?: string;
}

/**
 * Una regla del motor de correo o de WhatsApp, reducida a lo que hace falta
 * para saber si está empujando al cliente o no. La arma construirPalancas
 * juntando la regla que ya viene en AppData con el conteo de sus disparos.
 */
export interface Palanca {
  id: string;
  canal: "correo" | "whatsapp";
  nombre: string;
  activa: boolean;
  tipoEvento: string;
  condicionTipoVenta?: string;
  condicionDiasDespuesVencimiento?: number;
  disparosTotales: number;
  disparosPeriodo: number;
  erroresPeriodo: number;
  ultimoDisparo?: string;
}

/**
 * Junta las reglas de los dos motores con sus conteos de disparos.
 *
 * Las reglas se leen de AppData y no del servidor a propósito: son las mismas
 * filas que edita `commit` (ver commitReglasCorreo/commitReglasWhatsapp), así
 * que prender una palanca desde la pantalla se refleja al toque, sin volver a
 * pedir nada. Los conteos sí vienen del servidor — son un agregado sobre
 * decenas de miles de disparos que no tiene sentido bajar al navegador.
 *
 * Una regla sin conteo (nunca disparó) queda en cero, no se omite: ese es
 * justamente el caso que estadoPalanca marca como "muda".
 */
export function construirPalancas(
  reglasCorreo: { id: string; nombre: string; activa: boolean; tipoEvento: string; condicionTipoVenta?: string; condicionDiasDespuesVencimiento?: number }[],
  reglasWhatsapp: { id: string; nombre: string; activa: boolean; tipoEvento: string; condicionTipoVenta?: string }[],
  conteos: { correo: ConteoDisparos[]; whatsapp: ConteoDisparos[] }
): Palanca[] {
  const sinDisparos = { disparosTotales: 0, disparosPeriodo: 0, erroresPeriodo: 0, ultimoDisparo: undefined };
  const porCorreo = new Map(conteos.correo.map((c) => [c.reglaId, c]));
  const porWhatsapp = new Map(conteos.whatsapp.map((c) => [c.reglaId, c]));

  return [
    ...reglasCorreo.map((r) => ({ ...r, canal: "correo" as const, ...(porCorreo.get(r.id) ?? sinDisparos), id: r.id })),
    ...reglasWhatsapp.map((r) => ({ ...r, canal: "whatsapp" as const, ...(porWhatsapp.get(r.id) ?? sinDisparos), id: r.id })),
  ];
}

/**
 * "apagada": activa=false. "muda": encendida pero nunca disparó en toda su
 * historia — el caso peligroso, porque en la pantalla de reglas se ve igual
 * que una que sí funciona. "rebota": está mandando pero una porción grande
 * termina en error. "andando": mandando sin problemas.
 */
export type EstadoPalanca = "andando" | "rebota" | "muda" | "apagada";

/** Desde qué proporción de errores en el período una palanca se marca como que rebota. */
export const UMBRAL_ERROR_PALANCA = 0.1;

export function estadoPalanca(p: Pick<Palanca, "activa" | "disparosTotales" | "disparosPeriodo" | "erroresPeriodo">): EstadoPalanca {
  if (!p.activa) return "apagada";
  if (p.disparosTotales === 0) return "muda";
  if (p.disparosPeriodo > 0 && p.erroresPeriodo / p.disparosPeriodo >= UMBRAL_ERROR_PALANCA) return "rebota";
  return "andando";
}

/**
 * Sobre qué etapa actúa una regla, deducido de su tipo de evento. `null` para
 * las que no son palancas del embudo: un envío manual o la migración de
 * WooCommerce no dependen de en qué etapa está el cliente, y un cambio de
 * patente no lo mueve de etapa.
 */
export function etapaDePalanca(
  p: Pick<Palanca, "tipoEvento" | "condicionTipoVenta" | "condicionDiasDespuesVencimiento">
): EtapaId | null {
  switch (p.tipoEvento) {
    case "venta_creada":
    case "venta_creada_presencial":
      // Dispara DESPUÉS de la venta, así que actúa sobre la etapa en la que
      // el cliente queda parado: comprar plan lo deja al día, y un lavado
      // suelto lo deja donde ya estaba, lavando sin plan.
      return p.condicionTipoVenta && !TIPOS_VENTA_PLAN.has(p.condicionTipoVenta) ? "lavado_suelto" : "plan_activo";
    case "plan_proximo_vencer":
      return "por_vencer";
    case "plan_vencido":
      return (p.condicionDiasDespuesVencimiento ?? 0) > DIAS_VENCIDO_RECIENTE ? "vencido_frio" : "vencido_reciente";
    case "cobro_fallido":
    case "suscripcion_cancelada":
    case "ingreso_plan_registrado":
    case "primer_ingreso_mes":
    case "tope_ilimitado_superado":
      // Todas le pasan a alguien que TIENE plan andando: es la etapa desde la
      // que se cae si nadie le avisa.
      return "plan_activo";
    default:
      return null;
  }
}

/** Agrupa las palancas por la etapa sobre la que actúan; las que no son del embudo quedan fuera. */
export function palancasPorEtapa(palancas: Palanca[]): Record<EtapaId, Palanca[]> {
  const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e.id, [] as Palanca[]])) as Record<EtapaId, Palanca[]>;
  for (const p of palancas) {
    const etapa = etapaDePalanca(p);
    if (etapa) porEtapa[etapa].push(p);
  }
  return porEtapa;
}

// --- Línea de tiempo de UN cliente ---

export interface CorreoRecorrido {
  id: string;
  fecha: string;
  asunto: string;
  estado: string;
  error?: string;
}

export interface WhatsappRecorrido {
  id: string;
  fecha: string;
  texto: string;
  direccion: "entrante" | "saliente";
  estado?: string;
  error?: string;
}

export interface CobroRecorrido {
  id: string;
  fecha: string;
  monto: number;
  estado: string;
  cicloYm: string;
}

export interface ComunicacionesCliente {
  correos: CorreoRecorrido[];
  whatsapp: WhatsappRecorrido[];
  cobros: CobroRecorrido[];
}

export interface EventoRecorrido {
  id: string;
  fecha: string;
  tipo: "ingreso" | "venta" | "cobro" | "correo" | "whatsapp";
  titulo: string;
  detalle?: string;
  estado: "ok" | "error" | "neutro";
  /** Solo en WhatsApp: de qué lado viene el mensaje. */
  direccion?: "entrante" | "saliente";
  /** Etapa en la que estaba el cliente cuando pasó esto (ver etapaEnFecha). */
  etapa: EtapaId;
}

/**
 * Todo lo que le pasó a un cliente y todo lo que se le dijo, en una sola
 * línea de tiempo (lo más nuevo primero) y con la etapa en la que estaba en
 * cada momento. Es la contracara del embudo: el embudo dice dónde se cae la
 * gente, esto dice por qué se cayó este.
 */
export function construirRecorrido(opts: {
  clienteId: string;
  ventas: Venta[];
  ingresos: Ingreso[];
  comunicaciones: ComunicacionesCliente;
}): EventoRecorrido[] {
  const { clienteId, ventas, ingresos } = opts;
  const { correos, whatsapp, cobros } = opts.comunicaciones;

  const ventasCliente = ventas.filter((v) => v.clienteId === clienteId);
  const ingresosCliente = ingresos.filter((i) => i.clienteId === clienteId);
  const fechasPlan = ventasCliente.filter((v) => TIPOS_VENTA_PLAN.has(v.tipo)).map((v) => new Date(v.fecha).getTime());
  const primerIngreso = ingresosCliente.reduce<number | undefined>((min, i) => {
    const t = new Date(i.fecha).getTime();
    return min === undefined || t < min ? t : min;
  }, undefined);

  const etapaDe = (fecha: string): EtapaId => {
    const corte = new Date(fecha).getTime();
    const previa = ultimaAntesDe(fechasPlan, corte);
    return etapaEnFecha(
      fecha,
      previa === undefined ? undefined : new Date(previa).toISOString(),
      primerIngreso !== undefined && primerIngreso < corte
    );
  };

  const monto = (n: number) => "$" + n.toLocaleString("es-CL");

  const eventos: EventoRecorrido[] = [
    ...ingresosCliente.map((i) => ({
      id: `ingreso-${i.id}`,
      fecha: i.fecha,
      tipo: "ingreso" as const,
      titulo: i.esGarantia ? "Pasada de garantía" : i.viaCupon ? "Pasada con ticket" : "Pasada por el túnel",
      detalle: i.glosa || undefined,
      // planEstadoAlIngreso "bad" es el que pasó sin plan vigente (pagó
      // suelto): no es un error del sistema, pero sí la señal que interesa
      // distinguir de una pasada incluida en el plan.
      estado: i.planEstadoAlIngreso === "bad" ? ("neutro" as const) : ("ok" as const),
      etapa: etapaDe(i.fecha),
    })),
    ...ventasCliente.map((v) => ({
      id: `venta-${v.id}`,
      fecha: v.fecha,
      tipo: "venta" as const,
      titulo: v.tipo,
      detalle: [v.precio ? monto(v.precio) : "", v.metodoPago || "", v.creadoPor || ""].filter(Boolean).join(" · "),
      estado: "ok" as const,
      etapa: etapaDe(v.fecha),
    })),
    ...cobros.map((c) => ({
      id: `cobro-${c.id}`,
      fecha: c.fecha,
      tipo: "cobro" as const,
      titulo: c.estado === "aprobada" ? "Cobro automático aprobado" : "Cobro automático rechazado",
      detalle: `${monto(c.monto)} · ciclo ${c.cicloYm}`,
      estado: c.estado === "aprobada" ? ("ok" as const) : ("error" as const),
      etapa: etapaDe(c.fecha),
    })),
    ...correos.map((c) => ({
      id: `correo-${c.id}`,
      fecha: c.fecha,
      tipo: "correo" as const,
      titulo: c.asunto,
      detalle: c.error,
      estado: c.estado === "error" ? ("error" as const) : ("ok" as const),
      etapa: etapaDe(c.fecha),
    })),
    ...whatsapp.map((m) => ({
      id: `wa-${m.id}`,
      fecha: m.fecha,
      tipo: "whatsapp" as const,
      titulo: m.texto,
      detalle: m.error,
      estado: m.estado === "fallido" ? ("error" as const) : ("ok" as const),
      direccion: m.direccion,
      etapa: etapaDe(m.fecha),
    })),
  ];

  return eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}
