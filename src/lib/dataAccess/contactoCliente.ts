import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { correosAutomaticos, correosSuprimidos, mensajesSms } from "@/db/schema";
import { esErrorCorreoDeDireccion, esErrorSmsDeCuenta, fallasContacto, type FallasContacto } from "@/lib/helpers";
import type { Cliente } from "@/types";

/** "+56 9 1234 5678" → "56912345678", igual que msisdnChile (@/lib/sms/enviar), que es como queda en mensajes_sms. */
const soloDigitos = (t: string) => t.replace(/\D/g, "");

/**
 * Qué dato de contacto de este cliente hay que actualizar (ver fallasContacto).
 * El registro de qué no llegó ya existe: correos_automaticos (cada correo y si
 * salió), correos_suprimidos (rebotes) y mensajes_sms (cada SMS). Solo cuenta
 * el último envío al dato que tiene hoy la ficha: al corregirlo, el aviso se
 * va solo.
 */
export async function fallasContactoCliente(cliente: Cliente): Promise<FallasContacto> {
  const db = getDb();
  const email = (cliente.email || "").trim().toLowerCase();
  const telefono = soloDigitos(cliente.telefono || "");
  const [ultimoCorreo, suprimido, ultimoSms] = await Promise.all([
    email
      ? db
          .select({ estado: correosAutomaticos.estado, para: correosAutomaticos.para, error: correosAutomaticos.error })
          .from(correosAutomaticos)
          .where(eq(correosAutomaticos.clienteId, cliente.id))
          .orderBy(desc(correosAutomaticos.creadoEn))
          .limit(1)
      : [],
    // Solo rebotes: una queja de spam o una baja manual es el cliente diciendo
    // que no quiere correos, no un correo malo que haya que cambiar.
    email
      ? db
          .select({ email: correosSuprimidos.email })
          .from(correosSuprimidos)
          .where(and(eq(correosSuprimidos.email, email), eq(correosSuprimidos.motivo, "rebote")))
          .limit(1)
      : [],
    telefono
      ? db
          .select({ estado: mensajesSms.estado, error: mensajesSms.error })
          .from(mensajesSms)
          .where(and(eq(mensajesSms.clienteId, cliente.id), eq(mensajesSms.telefono, telefono.length === 9 ? "56" + telefono : telefono)))
          .orderBy(desc(mensajesSms.creadoEn))
          .limit(1)
      : [],
  ]);
  const correo = ultimoCorreo[0];
  const sms = ultimoSms[0];
  return fallasContacto(cliente, {
    correoFallido:
      !!correo && correo.estado === "error" && (correo.para || "").trim().toLowerCase() === email && esErrorCorreoDeDireccion(correo.error),
    correoSuprimido: suprimido.length > 0,
    smsFallido: !!sms && sms.estado === "fallido" && !esErrorSmsDeCuenta(sms.error),
  });
}
