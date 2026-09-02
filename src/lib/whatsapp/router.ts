import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { aplicarVariables, fmtCLP, isValidEmail, isValidPatente, normPlate, normalizarTextoBot, OPINION_NOTA_BUENA, opcionDeTexto, uid } from "@/lib/helpers";
// Directo a la capa de datos, no al Server Action de @/lib/serverActions: este flujo
// corre dentro del webhook de Meta (protegido por firma, ver
// /api/whatsapp/route.ts), no hay perfil logueado que pase el chequeo de
// sesión que exige el Server Action homónimo. getConfig trae
// textosBotWhatsapp ya mergeado con TEXTOS_BOT_WHATSAPP_DEFAULT (ver
// @/lib/dataAccess/config), así que cualquier texto que el admin no haya
// editado en Web Settings → Menú Bot WhatsApp sigue mostrando el de fábrica.
import {
  actualizarFlowStateConversacion,
  agregarComentarioOpinion,
  emitirCuponDescuentoPrimeraVez,
  getClientesByIds,
  getConfig,
  insertarOpinion,
  upsertClientes,
  vincularClienteConversacion,
} from "@/lib/dataAccess";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import type { Cliente, ConversacionWhatsapp, FlowStateWhatsapp, TextosBotWhatsapp } from "@/types";
import { parsearNotaOpinion, parsearTamano, textoPedirTamano, textoPrecios } from "./contenido";
import { estadoPlanPorPatente, iniciarCambioPatente, manejarPasoCambioPatente } from "./patente";

export type RespuestaBot = {
  texto: string;
  // true solo cuando el mensaje matchea OPCIONES_HUMANO — el webhook
  // (@/app/api/whatsapp/route.ts) lo usa para avisar a Gerencia por push
  // (ver enviarPushAGerencia en @/lib/push/enviar), sin acoplar este router
  // (que no tiene acceso a VAPID/DB de push) a esa capa de envío.
  solicitaHumano?: boolean;
};

const SALUDOS = new Set(["hola", "buenas", "buenos dias", "buenos días", "buenas tardes", "buenas noches", "menu", "menú", "hi", "hello"]);
const PALABRAS_SALIDA_FLUJO = new Set(["cancelar", "salir"]);
// Cerrar la conversación no es preguntar algo. Contestarles el menú completo
// (~20 veces entre jun y ago 2026, más los emoji sueltos) es lo que hace que
// el bot se vea roto: el cliente agradece y le vuelven a tirar las 5
// opciones encima. Mismo criterio que las reacciones en /api/whatsapp.
// Se compara contra las dos formas del mensaje (el texto tal cual y el
// normalizado sin tildes ni puntuación), así entran tanto "👍" como
// "Gracias!". Un "?" NO va acá: ese sí quiere algo, y le toca el menú.
const AGRADECIMIENTOS = new Set([
  "gracias", "muchas gracias", "ok", "oka", "okey", "dale", "listo", "perfecto", "bueno", "ya", "si", "no", "voy",
  "👍", "👍👍", "👌", "🙏", "🙌",
]);

function textoConfirmacionDescuento(textos: TextosBotWhatsapp, codigo: string, fechaCaducidadISO: string, valor: number): string {
  const fecha = new Date(fechaCaducidadISO).toLocaleDateString("es-CL");
  return aplicarVariables(textos.textoDescuentoConfirmacion, { codigo, fecha, monto: fmtCLP(valor) });
}

// Opción 1, paso 1: no se cotiza nada hasta saber el tamaño del vehículo.
// Mismo criterio que DetailingTab en la web — si ningún servicio del catálogo
// tiene precio diferenciado por tamaño, preguntarlo sería fricción inútil y
// se entrega la lista directo (con "m" como tamaño nominal, que en ese caso
// no afecta ningún precio porque todos caen al valor plano).
async function iniciarPrecios(conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  const precios = await getPreciosPublicos();
  if (!precios.servicios.some((s) => s.preciosTamano)) {
    return { texto: textoPrecios(precios, "m", textos.textoPreciosIntro) };
  }
  await actualizarFlowStateConversacion(conversacion.id, { tipo: "precios_tamano", paso: "tamano" });
  return { texto: textoPedirTamano(textos.textoPreciosPedirTamano) };
}

// Opción 1, paso 2: con el tamaño en mano se entrega la lista y se cierra el
// flujo. Una respuesta que no calza repregunta sin avanzar (el flowState
// queda igual), como los pasos del flujo de descuento.
async function manejarPasoPreciosTamano(texto: string, conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  const tamano = parsearTamano(texto);
  if (!tamano) return { texto: textos.textoPreciosTamanoInvalido };
  await actualizarFlowStateConversacion(conversacion.id, null);
  return { texto: textoPrecios(await getPreciosPublicos(), tamano, textos.textoPreciosIntro) };
}

// Opción 2. El texto editable (textoContratarPlan en Web Settings → Menú Bot
// WhatsApp) manda a /servicios/plan-mensual, que es un folleto: desde ahí
// todavía hay que apretar "Contratar", llegar a /pagar y tipear la patente en
// el teléfono. Cuando la conversación ya está enlazada a un Cliente —pasa
// apenas consultan su patente, ver vincularClienteConversacion en
// estadoPlanPorPatente— se agrega abajo el link directo al checkout con la
// patente puesta, que es el paso donde hoy se cae la venta.
async function textoContratarPlan(conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  const texto = textos.textoContratarPlan;
  if (!conversacion.clienteId) return { texto };
  const [cliente] = await getClientesByIds([conversacion.clienteId]);
  if (!cliente?.patente) return { texto };
  const url = `https://zplash.cl/pagar?item=plan&patente=${encodeURIComponent(cliente.patente)}`;
  return { texto: `${texto}\n\nO contrátalo directo para tu patente *${cliente.patente}*:\n${url}` };
}

async function existeClienteConPatente(patente: string): Promise<boolean> {
  const [fila] = await getDb().select({ id: clientes.id }).from(clientes).where(eq(clientes.patente, patente)).limit(1);
  return !!fila;
}

async function existeClienteConTelefono(telefono: string): Promise<boolean> {
  const [fila] = await getDb().select({ id: clientes.id }).from(clientes).where(eq(clientes.telefono, telefono)).limit(1);
  return !!fila;
}

// Punto de entrada de la Opción 5: si el número que escribe ya pertenece a un
// cliente registrado, el descuento no aplica (es solo para primera vez). Si
// no, arranca el flujo de 3 pasos (nombre → patente → mail) guardando el
// estado en la conversación — ver manejarPasoRegistroDescuento para lo que
// sigue después de este primer mensaje.
async function iniciarRegistroDescuento(
  conversacion: ConversacionWhatsapp,
  telefono: string,
  textos: TextosBotWhatsapp,
  descuentoValor: number,
  descuentoDiasValidez: number
): Promise<RespuestaBot> {
  if (conversacion.clienteId || (await existeClienteConTelefono(telefono))) {
    return { texto: textos.textoDescuentoYaCliente };
  }
  await actualizarFlowStateConversacion(conversacion.id, { tipo: "registro_descuento", paso: "nombre" });
  // textoDescuentoInstrucciones ya termina invitando a responder con el
  // nombre (ver TEXTOS_BOT_WHATSAPP_DEFAULT) — textoDescuentoPedirNombre es
  // un mensaje aparte, más corto, para cuando hay que repreguntar dentro del
  // mismo paso (ver manejarPasoRegistroDescuento).
  return {
    texto: aplicarVariables(textos.textoDescuentoInstrucciones, {
      monto: fmtCLP(descuentoValor),
      dias: String(descuentoDiasValidez),
    }),
  };
}

// Continúa el flujo de registro + descuento paso a paso. `conversacion`
// llega con el flowState previo a este mensaje (el que decide cómo
// interpretar `texto`); cada paso valida su dato, y si es válido avanza al
// siguiente guardando lo acumulado en flowState.datos, o si es el último
// (mail) crea el Cliente y el cupón y limpia el flowState.
async function manejarPasoRegistroDescuento(
  texto: string,
  conversacion: ConversacionWhatsapp,
  telefono: string,
  textos: TextosBotWhatsapp,
  descuentoValor: number,
  descuentoDiasValidez: number
): Promise<RespuestaBot> {
  const flowState = conversacion.flowState as FlowStateWhatsapp;

  if (flowState.paso === "nombre") {
    const nombre = texto.trim();
    if (!nombre) return { texto: textos.textoDescuentoPedirNombre };
    await actualizarFlowStateConversacion(conversacion.id, { tipo: "registro_descuento", paso: "patente", nombre });
    return { texto: textos.textoDescuentoPedirPatente };
  }

  if (flowState.paso === "patente") {
    const patente = normPlate(texto);
    if (!isValidPatente(patente)) return { texto: textos.textoDescuentoPatenteInvalida };
    if (await existeClienteConPatente(patente)) {
      await actualizarFlowStateConversacion(conversacion.id, null);
      return { texto: textos.textoDescuentoYaCliente };
    }
    await actualizarFlowStateConversacion(conversacion.id, { ...flowState, paso: "mail", patente });
    return { texto: textos.textoDescuentoPedirMail };
  }

  // paso === "mail"
  const email = texto.trim();
  if (!isValidEmail(email)) return { texto: textos.textoDescuentoMailInvalido };

  const { nombre, patente } = flowState;
  if (!nombre || !patente) {
    // No debería pasar (nombre/patente se guardan en los pasos anteriores),
    // pero si el flowState quedó incompleto no hay nada sano que hacer más
    // que reiniciar el flujo en vez de crear un Cliente a medias.
    await actualizarFlowStateConversacion(conversacion.id, { tipo: "registro_descuento", paso: "nombre" });
    return { texto: textos.textoDescuentoPedirNombre };
  }

  // Reintento de la carrera: alguien pudo registrar esta patente físicamente
  // en el local mientras el cliente escribía por WhatsApp.
  if (await existeClienteConPatente(patente)) {
    await actualizarFlowStateConversacion(conversacion.id, null);
    return { texto: textos.textoDescuentoYaCliente };
  }

  const ahora = new Date().toISOString();
  const nuevoCliente: Cliente = {
    id: uid(),
    nombre,
    patente,
    telefono,
    email,
    plan: "",
    vencimiento: null,
    origen: "LOCAL",
    visitas: 0,
    creadoEn: ahora,
    creadoPor: "whatsapp-bot",
  };
  await upsertClientes([nuevoCliente]);
  await vincularClienteConversacion(conversacion.id, nuevoCliente.id);

  const cupon = await emitirCuponDescuentoPrimeraVez({
    patente,
    valor: descuentoValor,
    diasValidez: descuentoDiasValidez,
    nombreLote: "WhatsApp - Primera vez",
    creadoPor: "whatsapp-bot",
  });
  await actualizarFlowStateConversacion(conversacion.id, null);

  return { texto: textoConfirmacionDescuento(textos, cupon.codigo, cupon.fechaCaducidad, cupon.valor) };
}

// Opción 6, y lo que abre el QR pegado en el túnel. Vale la pena por dos
// cosas a la vez: junta la nota del lavado, y el mensaje entrante del cliente
// abre la ventana de servicio de 24h de Meta, dentro de la cual los templates
// UTILITY que le mandemos después no se cobran.
async function iniciarOpinion(conversacion: ConversacionWhatsapp, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  await actualizarFlowStateConversacion(conversacion.id, { tipo: "opinion", paso: "nota" });
  return { texto: textos.textoOpinionPedirNota };
}

// Dos pasos: nota (1-7) y, solo si la nota es baja, el motivo. Una nota que no
// es un entero de 1 a 7 repregunta sin avanzar, igual que el resto de los
// flujos; para salir está "menu"/"cancelar", que maneja responderMensaje.
async function manejarPasoOpinion(
  texto: string,
  conversacion: ConversacionWhatsapp,
  telefono: string,
  textos: TextosBotWhatsapp
): Promise<RespuestaBot> {
  const flowState = conversacion.flowState as FlowStateWhatsapp;

  if (flowState.paso === "nota") {
    const nota = parsearNotaOpinion(texto);
    if (nota === null) return { texto: textos.textoOpinionNotaInvalida };
    const { id } = await insertarOpinion({ telefono, nota, clienteId: conversacion.clienteId });
    if (nota >= OPINION_NOTA_BUENA) {
      await actualizarFlowStateConversacion(conversacion.id, null);
      return { texto: textos.textoOpinionGracias };
    }
    await actualizarFlowStateConversacion(conversacion.id, { tipo: "opinion", paso: "comentario", opinionId: id });
    return { texto: textos.textoOpinionPedirComentario };
  }

  // paso === "comentario". `opinionId` siempre viene del paso anterior; si
  // faltara, el comentario se pierde pero la nota ya quedó guardada, que es
  // el dato que importa — no vale la pena reiniciar el flujo por eso.
  if (flowState.opinionId) await agregarComentarioOpinion(flowState.opinionId, texto.trim());
  await actualizarFlowStateConversacion(conversacion.id, null);
  // Una nota baja con motivo es lo que Gerencia tiene que ver hoy, no en el
  // reporte de fin de mes: mismo push que "hablar con una persona".
  return { texto: textos.textoOpinionGraciasReclamo, solicitaHumano: true };
}

/** `null` cuando no hay nada que contestar (un emoji, un "gracias"). */
export async function responderMensaje(textoCrudo: string, telefono: string, conversacion: ConversacionWhatsapp): Promise<RespuestaBot | null> {
  const texto = (textoCrudo || "").trim();
  const normalizado = texto.toLowerCase();
  const { textosBotWhatsapp: textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez } = await getConfig();

  // El registro + descuento (Opción 5) y el cambio de patente son las únicas
  // ramas con estado entre mensajes: mientras alguna esté activa, cualquier
  // texto se interpreta como el dato que toca, salvo que el usuario escriba
  // un saludo/"menu"/"cancelar" para salir sin terminarla.
  const flujoActivo = conversacion.flowState?.tipo;
  const quiereSalirDelFlujo = SALUDOS.has(normalizado) || PALABRAS_SALIDA_FLUJO.has(normalizado);
  if (flujoActivo && !quiereSalirDelFlujo) {
    if (flujoActivo === "registro_descuento") {
      return manejarPasoRegistroDescuento(texto, conversacion, telefono, textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez);
    }
    if (flujoActivo === "precios_tamano") {
      return manejarPasoPreciosTamano(texto, conversacion, textos);
    }
    if (flujoActivo === "opinion") {
      return manejarPasoOpinion(texto, conversacion, telefono, textos);
    }
    return manejarPasoCambioPatente(texto, conversacion, textos);
  }
  if (flujoActivo && quiereSalirDelFlujo) {
    await actualizarFlowStateConversacion(conversacion.id, null);
  }

  // `!texto` es una foto, un audio o un documento sin pie (ver
  // manejarMensajeEntrante): ahí hay alguien tratando de decir algo, y el
  // menú es mejor que el silencio.
  if (!texto || SALUDOS.has(normalizado)) return { texto: textos.menuPrincipal };
  // Un "gracias" o un pulgar arriba cierran la conversación, no preguntan
  // nada: contestarles el menú completo es lo que hace que el bot se vea roto.
  if (AGRADECIMIENTOS.has(normalizado) || AGRADECIMIENTOS.has(normalizarTextoBot(texto).trim())) return null;
  if (isValidPatente(texto)) return estadoPlanPorPatente(texto, textos, telefono, conversacion);

  // Antes de acá había un corte que respondía el menú a CUALQUIER cosa que
  // llegara si el bot no había hablado en las últimas 24h. Como los links de
  // la propia web abren WhatsApp con el texto ya escrito ("Hola, quiero
  // gestionar mi renovación automática"), y eso es siempre un primer mensaje,
  // el cliente con la intención más clara del canal era justo el que recibía
  // el menú genérico: 10 veces entre jun y ago 2026. Un saludo o un texto que
  // no calza con nada sigue viendo el menú, que es lo que ese corte buscaba.
  switch (opcionDeTexto(texto)) {
    case "precios":
      return iniciarPrecios(conversacion, textos);
    case "contratar_plan":
      return textoContratarPlan(conversacion, textos);
    case "horario":
      return { texto: textos.horarioUbicacion };
    // Las tres terminan igual —acuse de recibo y push a Gerencia— porque
    // ninguna se resuelve sin una persona: la renovación legacy la cobra
    // WooCommerce y el detailing se agenda a mano.
    case "humano":
    case "renovacion_auto":
    case "agendar":
      return { texto: textos.contactoHumano, solicitaHumano: true };
    case "descuento":
      return iniciarRegistroDescuento(conversacion, telefono, textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez);
    case "cambio_patente":
      return iniciarCambioPatente(conversacion, textos);
    case "opinion":
      return iniciarOpinion(conversacion, textos);
  }

  // Cualquier texto que no sea una opción conocida devuelve el menú: da lo
  // mismo lo que escriban, lo primero que ven es el menú (antes respondía un
  // "no entendí" que dejaba al cliente sin saber qué escribir).
  return { texto: textos.menuPrincipal };
}
