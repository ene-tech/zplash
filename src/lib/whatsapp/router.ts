import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones, precios as preciosTabla, servicios as serviciosTabla } from "@/db/schema";
import { aplicarVariables, fmtCLP, fmtFecha, generarCodigoCupon, isValidPatente, normPlate, planStatus, SERVICIOS_DEFAULT, uid } from "@/lib/helpers";
// Directo a la capa de datos, no al Server Action de @/lib/db: este flujo
// corre dentro del webhook de Meta (protegido por firma, ver
// /api/whatsapp/route.ts), no hay perfil logueado que pase el chequeo de
// sesión que exige el Server Action homónimo. getConfig trae
// textosBotWhatsapp ya mergeado con TEXTOS_BOT_WHATSAPP_DEFAULT (ver
// @/lib/dataAccess/config), así que cualquier texto que el admin no haya
// editado en Web Settings → Menú Bot WhatsApp sigue mostrando el de fábrica.
import { getConfig, upsertCupones } from "@/lib/dataAccess";
import type { Cupon, Precios, TextosBotWhatsapp } from "@/types";
import { DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ, DESCUENTO_PRIMERA_VEZ_VALOR, PLAN_IMAGEN_PATH, SERVICIOS_IMAGEN_PATH, textoPrecios } from "./contenido";

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
const REGEX_DESCUENTO_PATENTE = /^(?:descuento|dscto)\s+([a-z0-9]+)$/i;

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
  const lineas = [
    `🚗 *${cliente.patente}* — ${cliente.nombre}`,
    `Plan: ${cliente.plan || "Sin plan"}`,
    `Estado: ${estado.label}`,
  ];
  if (cliente.vencimiento) lineas.push(`Vencimiento: ${fmtFecha(cliente.vencimiento)}`);
  if (estado.cls === "warn" && estado.diasRestantes !== undefined) {
    lineas.push(`⚠️ Vence en ${estado.diasRestantes} día(s).`);
  }
  if (estado.cls === "bad") {
    lineas.push(``, `Tu plan no está vigente. Escribe *1* para ver precios de renovación.`);
  }
  return { texto: lineas.join("\n") };
}

function textoConfirmacionDescuento(textos: TextosBotWhatsapp, codigo: string, fechaCaducidadISO: string): string {
  const fecha = new Date(fechaCaducidadISO).toLocaleDateString("es-CL");
  return aplicarVariables(textos.textoDescuentoConfirmacion, { codigo, fecha, monto: fmtCLP(DESCUENTO_PRIMERA_VEZ_VALOR) });
}

async function manejarDescuentoPrimeraVez(patenteCruda: string, textos: TextosBotWhatsapp): Promise<RespuestaBot> {
  const patente = normPlate(patenteCruda);
  if (!isValidPatente(patente)) return { texto: textos.textoDescuentoPatenteInvalida };

  const db = getDb();
  const [clienteExistente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
  if (clienteExistente) return { texto: textos.textoDescuentoYaCliente };

  const ahora = new Date();
  const [pendiente] = await db
    .select()
    .from(cupones)
    .where(and(eq(cupones.patenteAsignada, patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false)))
    .limit(1);
  if (pendiente && new Date(pendiente.fechaCaducidad) > ahora) {
    return { texto: textoConfirmacionDescuento(textos, pendiente.codigo, pendiente.fechaCaducidad) };
  }

  const existentesRows = await db.select({ codigo: cupones.codigo }).from(cupones);
  const codigo = generarCodigoCupon(new Set(existentesRows.map((r) => r.codigo)));
  const fechaCaducidad = new Date(ahora.getTime() + DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ * 86400000).toISOString();

  const nuevo: Cupon = {
    id: uid(),
    codigo,
    nombreLote: "WhatsApp - Primera vez",
    valor: DESCUENTO_PRIMERA_VEZ_VALOR,
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

  return { texto: textoConfirmacionDescuento(textos, codigo, fechaCaducidad) };
}

export async function responderMensaje(textoCrudo: string, telefono: string): Promise<RespuestaBot> {
  const texto = (textoCrudo || "").trim();
  const normalizado = texto.toLowerCase();
  const { textosBotWhatsapp: textos, imagenPreciosWhatsapp, imagenPlanWhatsapp } = await getConfig();

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
    return { texto: aplicarVariables(textos.textoDescuentoInstrucciones, { monto: fmtCLP(DESCUENTO_PRIMERA_VEZ_VALOR), dias: String(DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ) }) };
  }

  const matchDescuento = normalizado.match(REGEX_DESCUENTO_PATENTE);
  if (matchDescuento) return manejarDescuentoPrimeraVez(matchDescuento[1], textos);

  return { texto: textos.mensajeNoEntendido };
}
