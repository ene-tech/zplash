import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, precios as preciosTabla, servicios as serviciosTabla } from "@/db/schema";
import { aplicarVariables, fmtCLP, fmtFecha, generarCodigoCupon, isValidEmail, isValidPatente, normPlate, planStatus, SERVICIOS_DEFAULT, uid } from "@/lib/helpers";
// Directo a la capa de datos, no al Server Action de @/lib/db: este flujo
// corre dentro del webhook de Meta (protegido por firma, ver
// /api/whatsapp/route.ts), no hay perfil logueado que pase el chequeo de
// sesión que exige el Server Action homónimo. getConfig trae
// textosBotWhatsapp ya mergeado con TEXTOS_BOT_WHATSAPP_DEFAULT (ver
// @/lib/dataAccess/config), así que cualquier texto que el admin no haya
// editado en Web Settings → Menú Bot WhatsApp sigue mostrando el de fábrica.
import { actualizarFlowStateConversacion, cuponFromRow, getConfig, upsertClientes, upsertCupones, vincularClienteConversacion } from "@/lib/dataAccess";
import type { Cliente, ConversacionWhatsapp, Cupon, FlowStateWhatsapp, Precios, TextosBotWhatsapp } from "@/types";
import { PLAN_IMAGEN_PATH, SERVICIOS_IMAGEN_PATH, textoPrecios } from "./contenido";

export type RespuestaBot = {
  texto: string;
  mediaPath?: string;
};

const SALUDOS = new Set(["hola", "buenas", "buenos dias", "buenos días", "buenas tardes", "buenas noches", "menu", "menú", "hi", "hello"]);
const OPCIONES_PRECIOS = new Set(["1", "precios", "precio", "servicios"]);
const OPCIONES_CONTRATAR_PLAN = new Set(["2", "contratar", "quiero el plan", "quiero contratar el plan"]);
const OPCIONES_HORARIO = new Set(["3", "horario", "horarios", "ubicacion", "ubicación"]);
const OPCIONES_HUMANO = new Set(["4", "humano", "ayuda", "persona"]);
const OPCIONES_DESCUENTO = new Set(["5", "descuento", "dscto"]);
const PALABRAS_SALIDA_FLUJO = new Set(["cancelar", "salir"]);

async function estadoPlanPorPatente(patenteCruda: string, textos: TextosBotWhatsapp, telefono: string): Promise<RespuestaBot> {
  const patente = normPlate(patenteCruda);
  const db = getDb();
  const [cliente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);

  // No entregamos datos del cliente si el teléfono que escribe no es el
  // registrado para esa patente, para no filtrar información a un número
  // ajeno (mismo mensaje que "no encontrada" para no confirmar que la
  // patente existe).
  if (!cliente || cliente.telefono !== telefono) return { texto: textos.patenteNoEncontrada };

  const estado = planStatus(cliente);
  const plan = cliente.plan || textos.patenteEstadoPlanVacio;
  const lineas = [
    aplicarVariables(textos.patenteEstadoEncabezado, { patente: cliente.patente, nombre: cliente.nombre }),
    aplicarVariables(textos.patenteEstadoPlan, { plan }),
    aplicarVariables(textos.patenteEstadoLinea, { estado: estado.label }),
  ];
  if (cliente.vencimiento) lineas.push(aplicarVariables(textos.patenteEstadoVencimiento, { fecha: fmtFecha(cliente.vencimiento) }));
  if (estado.cls === "warn" && estado.diasRestantes !== undefined) {
    lineas.push(aplicarVariables(textos.patenteEstadoAvisoPorVencer, { dias: String(estado.diasRestantes) }));
  }
  if (estado.cls === "bad") {
    lineas.push(``, textos.patenteEstadoAvisoVencido);
  }
  return { texto: lineas.join("\n") };
}

function textoConfirmacionDescuento(textos: TextosBotWhatsapp, codigo: string, fechaCaducidadISO: string, valor: number): string {
  const fecha = new Date(fechaCaducidadISO).toLocaleDateString("es-CL");
  return aplicarVariables(textos.textoDescuentoConfirmacion, { codigo, fecha, monto: fmtCLP(valor) });
}

// Reutiliza un cupón "descuento" pendiente para esa patente si sigue vigente
// (evita generar uno nuevo si el cliente vuelve a pasar por el flujo antes
// de usarlo), o genera uno nuevo con el monto/vigencia configurados en
// ConfigGlobal.descuentoPrimeraVezValor/DiasValidez (editable en Web
// Settings → Menú Bot WhatsApp) — misma lógica que antes tenía
// manejarDescuentoPrimeraVez, ahora factorizada porque el flujo de registro
// (manejarPasoRegistroDescuento) la necesita en su último paso.
async function emitirCuponDescuentoPrimeraVez(patente: string, valor: number, diasValidez: number): Promise<Cupon> {
  const db = getDb();
  const ahora = new Date();
  const [pendiente] = await db
    .select()
    .from(cupones)
    .where(and(eq(cupones.patenteAsignada, patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false)))
    .limit(1);
  if (pendiente && new Date(pendiente.fechaCaducidad) > ahora) {
    return cuponFromRow(pendiente);
  }

  const existentesRows = await db.select({ codigo: cupones.codigo }).from(cupones);
  const codigo = generarCodigoCupon(new Set(existentesRows.map((r) => r.codigo)));
  const fechaCaducidad = new Date(ahora.getTime() + diasValidez * 86400000).toISOString();

  const nuevo: Cupon = {
    id: uid(),
    codigo,
    nombreLote: "WhatsApp - Primera vez",
    valor,
    numeroLote: 1,
    totalLote: 1,
    fechaCaducidad,
    usado: false,
    creadoEn: ahora.toISOString(),
    creadoPor: "whatsapp-bot",
    tipo: "descuento",
    patenteAsignada: patente,
  };
  await upsertCupones([nuevo]);
  return nuevo;
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

  const cupon = await emitirCuponDescuentoPrimeraVez(patente, descuentoValor, descuentoDiasValidez);
  await actualizarFlowStateConversacion(conversacion.id, null);

  return { texto: textoConfirmacionDescuento(textos, cupon.codigo, cupon.fechaCaducidad, cupon.valor) };
}

export async function responderMensaje(textoCrudo: string, telefono: string, conversacion: ConversacionWhatsapp): Promise<RespuestaBot> {
  const texto = (textoCrudo || "").trim();
  const normalizado = texto.toLowerCase();
  const {
    textosBotWhatsapp: textos,
    imagenPreciosWhatsapp,
    imagenPlanWhatsapp,
    descuentoPrimeraVezValor,
    descuentoPrimeraVezDiasValidez,
  } = await getConfig();

  // El flujo de registro + descuento (Opción 5) es la única rama con estado
  // entre mensajes: mientras esté activo, cualquier texto se interpreta como
  // el dato que toca (nombre/patente/mail), salvo que el usuario escriba un
  // saludo/"menu"/"cancelar" para salir sin terminarlo.
  const enFlujoRegistro = conversacion.flowState?.tipo === "registro_descuento";
  const quiereSalirDelFlujo = SALUDOS.has(normalizado) || PALABRAS_SALIDA_FLUJO.has(normalizado);
  if (enFlujoRegistro && !quiereSalirDelFlujo) {
    return manejarPasoRegistroDescuento(texto, conversacion, telefono, textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez);
  }
  if (enFlujoRegistro && quiereSalirDelFlujo) {
    await actualizarFlowStateConversacion(conversacion.id, null);
  }

  if (!texto || SALUDOS.has(normalizado)) return { texto: textos.menuPrincipal };
  if (isValidPatente(texto)) return estadoPlanPorPatente(texto, textos, telefono);
  if (OPCIONES_PRECIOS.has(normalizado)) {
    const db = getDb();
    const [preciosRows, serviciosRows] = await Promise.all([
      db.select().from(preciosTabla),
      db.select().from(serviciosTabla),
    ]);
    const precios: Precios = Object.fromEntries(preciosRows.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
    const servicios = serviciosRows.length
      ? serviciosRows.map((s) => ({ ...s, categoria: s.categoria ?? undefined }))
      : SERVICIOS_DEFAULT;
    return { texto: textoPrecios(precios, servicios, textos.textoPreciosIntro), mediaPath: imagenPreciosWhatsapp || SERVICIOS_IMAGEN_PATH };
  }
  if (OPCIONES_CONTRATAR_PLAN.has(normalizado)) return { texto: textos.textoContratarPlan, mediaPath: imagenPlanWhatsapp || PLAN_IMAGEN_PATH };
  if (OPCIONES_HORARIO.has(normalizado)) return { texto: textos.horarioUbicacion };
  if (OPCIONES_HUMANO.has(normalizado)) return { texto: textos.contactoHumano };
  if (OPCIONES_DESCUENTO.has(normalizado)) {
    return iniciarRegistroDescuento(conversacion, telefono, textos, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez);
  }

  return { texto: textos.mensajeNoEntendido };
}
