import "server-only";

import { randomInt } from "node:crypto";
import { insertarMensajeSmsPendiente, marcarMensajeSms } from "@/lib/dataAccess";
import { uid } from "@/lib/helpers";
import { LARGO_CODIGO_BAJA, MAX_SEGMENTOS_SMS, segmentosSms, textoFinalSms } from "./texto";

// Proveedor: LabsMobile (API JSON, https://api.labsmobile.com/json/send, auth
// Basic usuario:token). Todo lo específico del proveedor vive en
// llamarLabsMobile, para poder cambiarlo sin tocar el resto.
//
// Variables de entorno:
//   LABSMOBILE_USUARIO  correo de la cuenta LabsMobile
//   LABSMOBILE_TOKEN    token de API (panel LabsMobile → Configuración → API)
//   LABSMOBILE_REMITENTE  opcional: remitente (tpoa) que ve el cliente, si la
//                         cuenta lo tiene habilitado para Chile
//   LABSMOBILE_PRUEBA=1   opcional: LabsMobile acepta el envío pero no lo manda
//                         a la red (no llega ni se cobra) — para probar de punta a punta

const URL_ENVIO = "https://api.labsmobile.com/json/send";

// Sin 0/O/1/I/L para que el código se pueda tipear si alguien lo copia a mano.
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generarCodigoBaja(): string {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO_BAJA; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

/** "+56 9 1234 5678" → "56912345678"; null si no es un celular chileno. */
export function msisdnChile(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  return /^569\d{8}$/.test(digitos) ? digitos : null;
}

async function llamarLabsMobile(msisdn: string, texto: string, subid: string): Promise<{ ok: boolean; proveedorId?: string; error?: string }> {
  const usuario = process.env.LABSMOBILE_USUARIO;
  const token = process.env.LABSMOBILE_TOKEN;
  if (!usuario || !token) return { ok: false, error: "Faltan LABSMOBILE_USUARIO / LABSMOBILE_TOKEN en las variables de entorno" };

  const body: Record<string, unknown> = { message: texto, recipient: [{ msisdn }], subid };
  if (segmentosSms(texto) > 1) body.long = 1;
  if (process.env.LABSMOBILE_REMITENTE) body.tpoa = process.env.LABSMOBILE_REMITENTE;
  if (process.env.LABSMOBILE_PRUEBA === "1") body.test = 1;

  try {
    const res = await fetch(URL_ENVIO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${usuario}:${token}`).toString("base64")}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { code?: string; message?: string; subid?: string } | null;
    // LabsMobile responde code "0" cuando acepta el envío; cualquier otro
    // código trae el motivo en `message` (sin saldo, número inválido, etc.).
    if (!res.ok || data?.code !== "0") {
      console.error("Error enviando SMS (LabsMobile)", res.status, data);
      return { ok: false, error: `${data?.code ?? res.status}: ${data?.message ?? "respuesta inválida de LabsMobile"}` };
    }
    return { ok: true, proveedorId: data.subid ?? subid };
  } catch (error) {
    console.error("Error de red enviando SMS", error);
    return { ok: false, error: "Error de red" };
  }
}

/**
 * Envía un SMS de campaña a un cliente y lo registra en mensajes_sms. El texto
 * se normaliza a GSM-7 y se le agrega el link de baja (ver ./texto); si así
 * pasa de MAX_SEGMENTOS_SMS no se envía.
 */
export async function enviarSms(opts: {
  telefono: string;
  texto: string;
  campana: string;
  clienteId?: string;
  enviadoPor?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const msisdn = msisdnChile(opts.telefono);
  if (!msisdn) return { ok: false, error: "Teléfono no es un celular chileno" };

  // Reserva el código de baja insertando la fila; ante un choque (muy raro con
  // 31^6 combinaciones) prueba con otro.
  const id = uid() + randomInt(1000);
  let texto = "";
  let reservado = false;
  for (let intento = 0; intento < 5 && !reservado; intento++) {
    const codigoBaja = generarCodigoBaja();
    texto = textoFinalSms(opts.texto, codigoBaja);
    const segmentos = segmentosSms(texto);
    if (segmentos > MAX_SEGMENTOS_SMS) return { ok: false, error: `Texto demasiado largo (${segmentos} SMS, máximo ${MAX_SEGMENTOS_SMS})` };
    reservado = await insertarMensajeSmsPendiente({
      id,
      clienteId: opts.clienteId ?? null,
      telefono: msisdn,
      campana: opts.campana,
      texto,
      segmentos,
      codigoBaja,
      enviadoPor: opts.enviadoPor,
    });
  }
  if (!reservado) return { ok: false, error: "No se pudo generar un código de baja único" };

  const resultado = await llamarLabsMobile(msisdn, texto, id);
  await marcarMensajeSms(id, resultado.ok ? { estado: "enviado", proveedorId: resultado.proveedorId } : { estado: "fallido", error: resultado.error });
  return { ok: resultado.ok, error: resultado.error };
}
