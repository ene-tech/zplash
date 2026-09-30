import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gte, lt, lte, notLike } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, ingresos, mensajesWhatsapp, plantillasWhatsapp, suscripcionesOneclick } from "@/db/schema";
import { getConfig } from "@/lib/dataAccess/config";
import { clienteFromRow } from "@/lib/dataAccess/clientes";
import { fmtCLP, fmtFecha, isValidPatente, normPlate, pasesIncluidos, periodoPlan, planStatus, planVigente } from "@/lib/helpers";
import { cotizarPlanWeb } from "@/lib/pagos";
import { POLITICAS } from "@/lib/politicas";
// Sin la caché de Next (getPreciosPublicos): el agente también corre en el
// script de prueba, fuera de Next, y 4 consultas no pesan al lado de Claude.
import { leerPreciosPublicos } from "@/lib/preciosPublicos";
import type { Cliente, ConversacionWhatsapp } from "@/types";

// Agente conversacional con Claude para el WhatsApp del negocio (sep-2026).
// Reemplaza al menú por palabras clave (@/lib/whatsapp/router) en las
// conversaciones que le asigna el webhook (@/app/api/whatsapp/route.ts). El
// embudo medido antes de construirlo: de 113 conversaciones con intención de
// compra, 3 recibían el link de pago — el menú no entendía la pregunta.
//
// Qué puede y qué no: solo informa, cotiza y entrega el link de pago. No
// escribe nada en la base, no da descuentos ni cambia patentes; lo que
// necesita una persona lo deriva (y el webhook avisa a Gerencia por push).
// Los datos de un cliente salen únicamente de herramientas que filtran por el
// teléfono que escribe — la misma regla que estadoPlanPorPatente
// (@/lib/whatsapp/patente) — así la privacidad no depende del modelo.

// Cada modelo acepta parámetros distintos: Haiku 4.5 no tiene `effort` ni
// thinking adaptativo, y los `fallbacks` de servidor son para Opus 5 (si
// Claude rechaza un mensaje, lo reintenta otro modelo en la misma llamada).
const PARAMETROS_MODELO = {
  "claude-opus-5": {
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  },
  "claude-sonnet-5": { thinking: { type: "adaptive" }, output_config: { effort: "high" } },
  "claude-haiku-4-5": { thinking: { type: "enabled", budget_tokens: 2048 } },
} satisfies Record<string, Partial<Anthropic.Beta.MessageCreateParamsNonStreaming>>;
export type ModeloAgente = keyof typeof PARAMETROS_MODELO;
// AGENTE_WHATSAPP_MODELO elige cuál (ver scripts/probar-agente-whatsapp.mts
// para compararlos); cualquier otro valor cae en Opus 5.
export const MODELO: ModeloAgente =
  (process.env.AGENTE_WHATSAPP_MODELO as ModeloAgente) in PARAMETROS_MODELO ? (process.env.AGENTE_WHATSAPP_MODELO as ModeloAgente) : "claude-opus-5";
const MAX_VUELTAS = 6;
// Lo que se le muestra de historial: las campañas se contestan hasta días
// después, y sin el mensaje que les llegó el agente no sabe de qué oferta
// le hablan.
const HORAS_HISTORIAL = 72;
const MAX_MENSAJES_HISTORIAL = 40;

export type RespuestaAgente = {
  texto: string;
  // Motivo, cuando el agente decidió que esto lo tiene que ver una persona.
  derivar?: string;
  // Para el script de prueba y los logs: qué herramientas usó y cuánto costó.
  herramientas: string[];
  uso: { entrada: number; cacheLeida: number; cacheEscrita: number; salida: number };
};

let cliente: Anthropic | undefined;
function anthropic() {
  // 40s por llamada, sin reintento: el webhook tiene maxDuration 120 y el
  // ciclo entero corta a los PLAZO_MS (ver responderConAgente), dejando margen
  // para que el catch de route.ts alcance a mandar el menú.
  cliente ??= new Anthropic({ timeout: 40_000, maxRetries: 0 });
  return cliente;
}

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "consultar_vehiculos",
    description:
      "Devuelve los vehículos registrados con el teléfono de esta conversación: plan, estado, vencimiento, lavados usados en el mes, " +
      "cobro automático, cupón de descuento vigente, precio exacto que verá al pagar y su link de pago. " +
      "Si el cliente menciona una patente, pásala en `patente`: si no está registrada o es de otro teléfono, devuelve solo el precio " +
      "general y el link, sin datos de nadie. Úsala antes de hablar de precios, planes, vencimientos o cupones de un cliente.",
    input_schema: {
      type: "object",
      properties: { patente: { type: "string", description: "Patente mencionada por el cliente, si la hay (ej. ABCD12)." } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_persona",
    description:
      "Avisa al equipo de ZPlash para que una persona continúe la conversación por este mismo WhatsApp. " +
      "Úsala cuando el cliente lo pida, ante reclamos, daños, cobros que no reconoce, reembolsos, cambio de patente o de auto, " +
      "agendar Detailing, el plan ilimitado antiguo, o cualquier cosa que requiera hacer algo que tú no puedes.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Resumen de una línea para el equipo: qué necesita el cliente." } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

function linkPago(patente: string) {
  return `https://zplash.cl/pagar?item=plan&patente=${encodeURIComponent(patente)}`;
}

async function fichaVehiculo(c: Cliente) {
  const db = getDb();
  const estado = planStatus(c);
  const plan = c.plan ? planVigente(c) : null;
  const [cotizacion, [suscripcion]] = await Promise.all([
    cotizarPlanWeb(c, db),
    db
      .select({ estado: suscripcionesOneclick.estado })
      .from(suscripcionesOneclick)
      .where(eq(suscripcionesOneclick.clienteId, c.id))
      .orderBy(desc(suscripcionesOneclick.creadoEn))
      .limit(1),
  ]);

  const cupon = cotizacion.cupon;
  let lavadosDelMes: string | undefined;
  if (estado.cls !== "bad" && c.vencimiento) {
    const { inicio, fin } = periodoPlan(c);
    const usados = (
      await db
        .select({ id: ingresos.id })
        .from(ingresos)
        .where(and(eq(ingresos.clienteId, c.id), gte(ingresos.fecha, inicio.toISOString()), lt(ingresos.fecha, fin.toISOString())))
    ).length;
    const incluidos = pasesIncluidos(plan);
    lavadosDelMes = incluidos ? `${usados} de ${incluidos}` : `${usados} (plan sin tope)`;
  }

  const primerCobro = cotizacion.primerCobroAuto > 0 ? cotizacion.primerCobroAuto : cotizacion.precioAutoMensual;
  return {
    patente: c.patente,
    nombre: c.nombre || undefined,
    plan: plan ?? "Sin plan",
    estado: estado.label,
    vencimiento: c.vencimiento ? fmtFecha(c.vencimiento) : undefined,
    lavadosDelMes,
    // El automático viejo (WooCommerce) no pasa por suscripcionesOneclick: sin
    // esto, al cliente que sí lo tiene se le decía que no.
    cobroAutomatico:
      suscripcion?.estado === "activa"
        ? "activo (tarjeta inscrita)"
        : c.renovacionAutoWooDesde && !c.suscripcionCanceladaEn
          ? "activo en el sistema antiguo (WooCommerce)"
          : (suscripcion?.estado ?? "no inscrito"),
    cuponVigente: cupon
      ? `${cupon.esPorcentaje ? `${cupon.valor}%` : fmtCLP(cupon.valor)} de descuento, vence ${fmtFecha(cupon.fechaCaducidad)}, se aplica solo al pagar el plan con tarjeta (link o QR en caja)`
      : "ninguno",
    pagandoConTarjetaAutomatico: `${fmtCLP(primerCobro)} el primer mes, después ${fmtCLP(cotizacion.precioAutoMensual)} al mes automático`,
    motivoDelPrecio:
      cotizacion.promoAuto?.tipo === "upgrade_plan"
        ? "Lavó hace poco: se pasa al plan pagando solo la diferencia sobre ese lavado (promoción por tiempo limitado)."
        : cotizacion.promoAuto?.tipo === "reactivacion"
          ? "Promoción de reactivación por tener el plan vencido."
          : cupon
            ? "Precio mensual con el cupón restado."
            : "Precio mensual normal.",
    renovarUnMesSinAutomatico: fmtCLP(cotizacion.precioFinal),
    linkDePago: linkPago(c.patente),
  };
}

async function consultarVehiculos(telefono: string, patenteCruda?: string): Promise<string> {
  const db = getDb();
  const propios = (await db.select().from(clientes).where(eq(clientes.telefono, telefono))).map(clienteFromRow);
  const patente = patenteCruda ? normPlate(patenteCruda) : undefined;

  if (patente && !propios.some((c) => c.patente === patente)) {
    if (!isValidPatente(patente)) return JSON.stringify({ error: `"${patenteCruda}" no parece una patente chilena válida.` });
    const precios = await leerPreciosPublicos();
    const [existe] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.patente, patente)).limit(1);
    return JSON.stringify({
      patente,
      nota: existe
        ? "Esta patente está registrada con OTRO teléfono: no reveles ningún dato de ella. Solo puedes dar el precio general y el link; al abrirlo verá su precio exacto."
        : "Patente nueva, sin historial en ZPlash.",
      precioPlanPrimeraContratacion: fmtCLP(precios.planPrimera.precio),
      linkDePago: linkPago(patente),
    });
  }

  const elegidos = patente ? propios.filter((c) => c.patente === patente) : propios;
  if (!elegidos.length) {
    return JSON.stringify({
      nota: "No hay vehículos registrados con este teléfono. Pídele la patente para cotizar y darle su link de pago.",
    });
  }
  return JSON.stringify(await Promise.all(elegidos.map(fichaVehiculo)));
}

// Instrucciones fijas + datos del negocio. Va primero y sin nada que cambie
// por mensaje (fecha, teléfono) para que el prompt caching lo reutilice entre
// conversaciones; lo variable va al final, en un mensaje de sistema.
async function instrucciones(): Promise<string> {
  const [{ textosBotWhatsapp }, precios] = await Promise.all([getConfig(), leerPreciosPublicos()]);
  const politicas = POLITICAS.map((s) => `${s.titulo}\n${s.puntos.map((p) => `- ${p}`).join("\n")}`).join("\n\n");
  return `Eres el asistente de WhatsApp de ZPlash CarWash, un túnel de lavado en Temuco, Chile. Atiendes a clientes y posibles clientes como lo haría una persona amable y resolutiva del equipo.

# Tu objetivo
Resolver lo que el cliente pregunta y, cuando tenga sentido, ayudarlo a contratar o reactivar el Plan X5. Cuando muestre interés en el plan, cotiza con consultar_vehiculos y entrégale su link de pago con la patente ya puesta. Si no sabes su patente, pídela. Ofrece el plan con naturalidad, sin presionar ni repetirlo si ya dijo que no.

# Cómo se contrata el plan
- Online: el link de pago (zplash.cl/pagar con su patente). Se paga con tarjeta y queda con cobro automático mensual; se da de baja cuando quiera desde Mi Cuenta.
- En el local: en caja le muestran un código QR que abre ese mismo link; lo paga con su tarjeta desde su celular ahí mismo.
- El Plan Ilimitado antiguo ya no se vende. Si el cliente lo tenía y está vencido, explícale su situación y ofrécele el Plan X5 con su link. Deriva solo si tiene dudas de un cobro o de su suscripción antigua.
- Los cupones de descuento de las campañas están cargados a la patente y se aplican solos al pagar el plan con tarjeta (link o QR). No se aplican a un lavado suelto ni pagando en efectivo en caja.
- El precio exacto de cada cliente (con promociones y cupón) sale de consultar_vehiculos. Nunca calcules ni inventes un precio distinto.
- Sin una patente cotizada, el Plan X5 se informa "desde" el precio de planPrimera (el que muestra la web) y se pide la patente para el precio exacto. El precio de lista (plan.precio) es pagar un mes en el local sin cobro automático: menciónalo solo si preguntan por esa forma de pago.
- Nunca sugieras cancelar, dar de baja ni detener un cobro automático. Si el cliente lo pide, explica que se hace desde Mi Cuenta o deriva.

# Qué incluye cada cosa
- El Lavado Full Túnel (único o del plan) incluye usar las aspiradoras de autoservicio sin límite de tiempo después del lavado. La "Zona Aspirado Autoservicio" con precio propio es solo para quien quiere aspirar sin lavar.
- Si el precio de un cliente tiene un motivo (motivoDelPrecio en consultar_vehiculos), explícalo con ese motivo y no con otro.

# Reglas
- Responde primero lo que el cliente preguntó con los datos que tienes, aunque después derives: nunca contestes solo "ya avisé al equipo".
- No escribas nada antes de usar una herramienta: primero consulta y después responde completo.
- No ofrezcas lo que no puedes hacer tú: recordatorios, reservas, agendar horas o llamar. Para agendar Detailing, deriva.
- Usa solo la información de este mensaje y de tus herramientas. Si no sabes algo, dilo y ofrece que alguien del equipo le responda (derivar_a_persona).
- No puedes dar descuentos, crear cupones, cambiar patentes, cobrar, reembolsar ni cancelar nada: para eso deriva.
- Nunca reveles datos de una patente que no esté registrada con el teléfono de esta conversación.
- Al derivar, dile que ya le avisaste al equipo y que le responderán por este mismo chat. No prometas plazos.
- Si el mensaje no es para ZPlash (respuestas automáticas de otras empresas, spam), responde solo con: NO_RESPONDER
- Si el cliente solo agradece o se despide y no hay nada más que decir, responde con una despedida muy corta.

# Estilo
- Español de Chile, cercano y claro, tuteando. Mensajes cortos: 1 a 4 líneas salvo que pidan una lista de precios.
- Formato de WhatsApp: *negrita* con un asterisco, sin títulos ni markdown de links; escribe los links tal cual. Emojis con moderación.
- Una sola pregunta por mensaje.

# Ubicación y horario
${textosBotWhatsapp.horarioUbicacion}

# Precios vigentes (CLP)
${JSON.stringify(precios)}

# Políticas del servicio (las que acepta el cliente)
${politicas}`;
}

// Historial de la conversación como turnos para Claude. Las plantillas se
// guardan como "[Plantilla: nombre]" (ver registrarSalida en ./enviar): se
// reemplazan por su texto para que el agente sepa qué oferta le llegó.
async function historial(conversacionId: string, hastaISO?: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const db = getDb();
  const hasta = hastaISO ?? new Date().toISOString();
  const desde = new Date(new Date(hasta).getTime() - HORAS_HISTORIAL * 3600_000).toISOString();
  const filas = (
    await db
      .select({ direccion: mensajesWhatsapp.direccion, texto: mensajesWhatsapp.texto, tipo: mensajesWhatsapp.tipo })
      .from(mensajesWhatsapp)
      .where(and(eq(mensajesWhatsapp.conversacionId, conversacionId), gte(mensajesWhatsapp.creadoEn, desde), lte(mensajesWhatsapp.creadoEn, hasta)))
      .orderBy(desc(mensajesWhatsapp.creadoEn))
      .limit(MAX_MENSAJES_HISTORIAL)
  ).reverse();

  const plantillas = new Map(
    (await db.select({ meta: plantillasWhatsapp.metaNombre, mensaje: plantillasWhatsapp.mensaje }).from(plantillasWhatsapp).orderBy(asc(plantillasWhatsapp.creadoEn))).map(
      (p) => [p.meta, p.mensaje]
    )
  );

  const turnos: Anthropic.Beta.BetaMessageParam[] = filas.map((f) => {
    if (f.direccion === "entrante") return { role: "user", content: f.texto };
    const nombre = f.tipo === "plantilla" ? /^\[Plantilla: (.+)\]$/.exec(f.texto)?.[1] : undefined;
    const texto = nombre ? `[Mensaje automático que le envió ZPlash]\n${plantillas.get(nombre) ?? nombre}` : f.texto;
    return { role: "assistant", content: texto };
  });
  // La API exige que empiece el usuario: si la conversación la abrió una
  // campaña, se antepone una marca (turnos seguidos del mismo rol se unen).
  if (turnos[0]?.role === "assistant") turnos.unshift({ role: "user", content: "[Inicio del chat]" });
  return turnos;
}

async function ultimoEntrante(conversacionId: string): Promise<string | undefined> {
  const [fila] = await getDb()
    .select({ id: mensajesWhatsapp.id })
    .from(mensajesWhatsapp)
    .where(
      and(
        eq(mensajesWhatsapp.conversacionId, conversacionId),
        eq(mensajesWhatsapp.direccion, "entrante"),
        // Reacciones, stickers, fotos sin texto ("[reaction]"...): no las
        // contesta nadie, así que no dejan vieja la respuesta en curso.
        notLike(mensajesWhatsapp.texto, "[%")
      )
    )
    .orderBy(desc(mensajesWhatsapp.creadoEn))
    .limit(1);
  return fila?.id;
}

// Tope del ciclo completo (varias llamadas a Claude + herramientas), bajo el
// maxDuration 120 del webhook: si se pasa, lanza y el menú alcanza a salir.
const PLAZO_MS = 80_000;

/**
 * Respuesta del agente al último mensaje del cliente. `texto` vacío = no hay
 * nada que enviar (el mensaje no era para ZPlash, o el cliente escribió de
 * nuevo y contesta la llamada siguiente), pero `derivar` se respeta igual.
 * Lanza si la API falla, se pasa del plazo o Claude se niega a responder: el
 * webhook cae al bot de siempre. `hastaISO` solo lo usa el script de prueba,
 * para responder como si fuera ese momento de una conversación pasada.
 */
export async function responderConAgente(
  conversacion: ConversacionWhatsapp,
  telefono: string,
  hastaISO?: string
): Promise<RespuestaAgente> {
  const inicio = Date.now();
  const resultado: RespuestaAgente = { texto: "", herramientas: [], uso: { entrada: 0, cacheLeida: 0, cacheEscrita: 0, salida: 0 } };
  const entranteInicial = await ultimoEntrante(conversacion.id);
  const mensajes = await historial(conversacion.id, hastaISO);
  if (mensajes.at(-1)?.role !== "user") return resultado;

  const ahora = new Date(hastaISO ?? Date.now()).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" });
  // Lo que cambia en cada llamada va en un bloque DESPUÉS del punto de caché:
  // las instrucciones (y las herramientas, que van antes) se reutilizan
  // entre conversaciones.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: await instrucciones(), cache_control: { type: "ephemeral" } },
    { type: "text", text: `Ahora es ${ahora} en Chile. Nombre del contacto en WhatsApp: ${conversacion.nombreContacto || "desconocido"}.` },
  ];
  // Texto de TODAS las vueltas, no solo la última: al derivar, el agente suele
  // explicar la situación y después llamar la herramienta, y quedarse con el
  // final dejaba al cliente con un "ya avisé al equipo" sin la respuesta.
  const textos: string[] = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (Date.now() - inicio > PLAZO_MS) throw new Error(`Agente WhatsApp: se pasó de ${PLAZO_MS / 1000}s`);
    const respuesta = await anthropic().beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      ...PARAMETROS_MODELO[MODELO],
      system,
      tools: HERRAMIENTAS,
      messages: mensajes,
    });
    resultado.uso.entrada += respuesta.usage.input_tokens;
    resultado.uso.cacheLeida += respuesta.usage.cache_read_input_tokens ?? 0;
    resultado.uso.cacheEscrita += respuesta.usage.cache_creation_input_tokens ?? 0;
    resultado.uso.salida += respuesta.usage.output_tokens;

    // Ni el modelo de respaldo quiso responder: que conteste el menú.
    if (respuesta.stop_reason === "refusal") throw new Error("Agente WhatsApp: Claude se negó a responder");

    for (const b of respuesta.content) if (b.type === "text" && b.text.trim() && b.text.trim() !== "FIN") textos.push(b.text.trim());
    const usos = respuesta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (respuesta.stop_reason !== "tool_use" || !usos.length) {
      resultado.texto = textos.join("\n\n");
      if (resultado.texto.includes("NO_RESPONDER")) resultado.texto = "";
      // El cliente escribió de nuevo mientras el agente pensaba ("hola",
      // "cuántos lavados", "?"): esta respuesta queda vieja y la del último
      // mensaje, que ya ve todo, es la que sale. Si decidió derivar, eso sí
      // se mantiene: la llamada siguiente no ve esta herramienta en el historial.
      if (!hastaISO && (await ultimoEntrante(conversacion.id)) !== entranteInicial) resultado.texto = "";
      return resultado;
    }

    mensajes.push({ role: "assistant", content: respuesta.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const uso of usos) {
      resultado.herramientas.push(uso.name);
      const entrada = uso.input as { patente?: string; motivo?: string };
      let contenido: string;
      try {
        if (uso.name === "consultar_vehiculos") contenido = await consultarVehiculos(telefono, entrada.patente);
        else if (uso.name === "derivar_a_persona") {
          resultado.derivar = entrada.motivo || "El cliente necesita a una persona";
          // Tu texto anterior ya se envía junto con este: sin esto, el agente
          // cerraba repitiendo "ya avisé al equipo".
          contenido = "Listo, el equipo fue avisado. Lo que ya escribiste se le envía al cliente; si ya le dijiste todo, responde solo: FIN";
        } else contenido = `Herramienta desconocida: ${uso.name}`;
      } catch (error) {
        console.error(`Agente WhatsApp: error en ${uso.name}`, error);
        resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "Error consultando los datos, intenta de nuevo o deriva.", is_error: true });
        continue;
      }
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: contenido });
    }
    mensajes.push({ role: "user", content: resultados });
  }
  throw new Error(`Agente WhatsApp: sin respuesta final tras ${MAX_VUELTAS} vueltas`);
}
