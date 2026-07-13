import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientes, cupones } from "@/db/schema";
import { fmtFecha, generarCodigoCupon, isValidPatente, normPlate, planStatus, uid } from "@/lib/helpers";
// Directo a la capa de datos, no al Server Action de @/lib/db: este flujo
// corre dentro del webhook de Twilio (protegido por firma, ver
// /api/whatsapp/route.ts), no hay perfil logueado que pase el chequeo de
// sesión que exige el Server Action homónimo.
import { upsertCupones } from "@/lib/dataAccess";
import type { Cupon } from "@/types";
import {
  CONTACTO_HUMANO,
  DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ,
  DESCUENTO_PRIMERA_VEZ_VALOR,
  HORARIO_UBICACION,
  MENSAJE_NO_ENTENDIDO,
  MENU_PRINCIPAL,
  PATENTE_NO_ENCONTRADA,
  PLAN_IMAGEN_PATH,
  SERVICIOS_IMAGEN_PATH,
  TEXTO_CONTRATAR_PLAN,
  TEXTO_DESCUENTO_INSTRUCCIONES,
  TEXTO_DESCUENTO_PATENTE_INVALIDA,
  TEXTO_DESCUENTO_YA_CLIENTE,
  textoDescuentoConfirmacion,
  textoPrecios,
} from "./contenido";

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

async function estadoPlanPorPatente(patenteCruda: string): Promise<RespuestaBot> {
  const patente = normPlate(patenteCruda);
  const db = getDb();
  const [cliente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);

  if (!cliente) return { texto: PATENTE_NO_ENCONTRADA };

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

async function manejarDescuentoPrimeraVez(patenteCruda: string): Promise<RespuestaBot> {
  const patente = normPlate(patenteCruda);
  if (!isValidPatente(patente)) return { texto: TEXTO_DESCUENTO_PATENTE_INVALIDA };

  const db = getDb();
  const [clienteExistente] = await db.select().from(clientes).where(eq(clientes.patente, patente)).limit(1);
  if (clienteExistente) return { texto: TEXTO_DESCUENTO_YA_CLIENTE };

  const ahora = new Date();
  const [pendiente] = await db
    .select()
    .from(cupones)
    .where(and(eq(cupones.patenteAsignada, patente), eq(cupones.tipo, "descuento"), eq(cupones.usado, false)))
    .limit(1);
  if (pendiente && new Date(pendiente.fechaCaducidad) > ahora) {
    return { texto: textoDescuentoConfirmacion(pendiente.codigo, pendiente.fechaCaducidad) };
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

  return { texto: textoDescuentoConfirmacion(codigo, fechaCaducidad) };
}

export async function responderMensaje(textoCrudo: string): Promise<RespuestaBot> {
  const texto = (textoCrudo || "").trim();
  const normalizado = texto.toLowerCase();

  if (!texto || SALUDOS.has(normalizado)) return { texto: MENU_PRINCIPAL };
  if (isValidPatente(texto)) return estadoPlanPorPatente(texto);
  if (OPCIONES_PRECIOS.has(normalizado)) return { texto: textoPrecios(), mediaPath: SERVICIOS_IMAGEN_PATH };
  if (OPCIONES_CONTRATAR_PLAN.has(normalizado)) return { texto: TEXTO_CONTRATAR_PLAN, mediaPath: PLAN_IMAGEN_PATH };
  if (OPCIONES_HORARIO.has(normalizado)) return { texto: HORARIO_UBICACION };
  if (OPCIONES_HUMANO.has(normalizado)) return { texto: CONTACTO_HUMANO };
  if (OPCIONES_DESCUENTO.has(normalizado)) return { texto: TEXTO_DESCUENTO_INSTRUCCIONES };

  const matchDescuento = normalizado.match(REGEX_DESCUENTO_PATENTE);
  if (matchDescuento) return manejarDescuentoPrimeraVez(matchDescuento[1]);

  return { texto: MENSAJE_NO_ENTENDIDO };
}
