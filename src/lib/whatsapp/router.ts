import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes } from "@/db/schema";
import { aplicarVariables, fmtCLP, isValidEmail, isValidPatente, normPlate, uid } from "@/lib/helpers";
// Directo a la capa de datos, no al Server Action de @/lib/serverActions: este flujo
// corre dentro del webhook de Meta (protegido por firma, ver
// /api/whatsapp/route.ts), no hay perfil logueado que pase el chequeo de
// sesión que exige el Server Action homónimo. getConfig trae
// textosBotWhatsapp ya mergeado con TEXTOS_BOT_WHATSAPP_DEFAULT (ver
// @/lib/dataAccess/config), así que cualquier texto que el admin no haya
// editado en Web Settings → Menú Bot WhatsApp sigue mostrando el de fábrica.
import {
  actualizarFlowStateConversacion,
  emitirCuponDescuentoPrimeraVez,
  esInicioDeConversacion,
  getConfig,
  upsertClientes,
  vincularClienteConversacion,
} from "@/lib/dataAccess";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import type { Cliente, ConversacionWhatsapp, FlowStateWhatsapp, TextosBotWhatsapp } from "@/types";
import { parsearTamano, textoPedirTamano, textoPrecios } from "./contenido";
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
const OPCIONES_PRECIOS = new Set(["1", "precios", "precio", "servicios"]);
const OPCIONES_CONTRATAR_PLAN = new Set(["2", "contratar", "quiero el plan", "quiero contratar el plan"]);
const OPCIONES_HORARIO = new Set(["3", "horario", "horarios", "ubicacion", "ubicación"]);
const OPCIONES_HUMANO = new Set(["4", "humano", "ayuda", "persona"]);
const OPCIONES_DESCUENTO = new Set(["5", "descuento", "dscto"]);
const OPCIONES_CAMBIO_PATENTE = new Set(["cambio de patente", "cambio patente", "cambiar patente"]);
const PALABRAS_SALIDA_FLUJO = new Set(["cancelar", "salir"]);

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

export async function responderMensaje(textoCrudo: string, telefono: string, conversacion: ConversacionWhatsapp): Promise<RespuestaBot> {
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
    return manejarPasoCambioPatente(texto, conversacion, textos);
  }
  if (flujoActivo && quiereSalirDelFlujo) {
    await actualizarFlowStateConversacion(conversacion.id, null);
  }

  // El menú es siempre el primer mensaje de una conversación: si el bot no
  // respondió nada en las últimas 24h, da lo mismo lo que hayan escrito
  // (patente, "1", lo que sea) — primero ven el menú, y desde el mensaje
  // siguiente el texto ya se interpreta como opción.
  if (await esInicioDeConversacion(conversacion.id)) return { texto: textos.menuPrincipal };

  if (!texto || SALUDOS.has(normalizado)) return { texto: textos.menuPrincipal };
  if (isValidPatente(texto)) return estadoPlanPorPatente(texto, textos, telefono, conversacion);
  if (OPCIONES_PRECIOS.has(normalizado)) return iniciarPrecios(conversacion, textos);
  if (OPCIONES_CONTRATAR_PLAN.has(normalizado)) return { texto: textos.textoContratarPlan };
  if (OPCIONES_HORARIO.has(normalizado)) return { texto: textos.horarioUbicacion };
  if (OPCIONES_HUMANO.has(normalizado)) return { texto: textos.contactoHumano, solicitaHumano: true };
  if (OPCIONES_DESCUENTO.has(normalizado)) {
    return iniciarRegistroDescuento(conversacion, telefono, textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez);
  }
  if (OPCIONES_CAMBIO_PATENTE.has(normalizado)) return iniciarCambioPatente(conversacion, textos);

  // Cualquier texto que no sea una opción conocida devuelve el menú: da lo
  // mismo lo que escriban, lo primero que ven es el menú (antes respondía un
  // "no entendí" que dejaba al cliente sin saber qué escribir).
  return { texto: textos.menuPrincipal };
}
