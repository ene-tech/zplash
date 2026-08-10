import "server-only";

import type { FetchMessageObject, ListResponse, MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { conConexionImap } from "./cliente";
import type { AdjuntoCorreo, AdjuntoDescargado, CarpetaBuzon, CorreoDetalle, CorreoResumen } from "@/types";

const LIMITE_LISTA_DEFAULT = 30;

// Orden de despliegue: Bandeja de entrada primero, después las carpetas
// especiales conocidas (Enviados/Borradores), el resto alfabético, y
// Papelera/Spam siempre al final — igual que la mayoría de los webmail.
const ORDEN_ESPECIAL: Record<string, number> = { inbox: 0, sent: 1, drafts: 2, junk: 98, trash: 99 };

function ordenarCarpetas(carpetas: CarpetaBuzon[]): CarpetaBuzon[] {
  return [...carpetas].sort((a, b) => {
    const oa = a.especial ? ORDEN_ESPECIAL[a.especial] : 50;
    const ob = b.especial ? ORDEN_ESPECIAL[b.especial] : 50;
    if (oa !== ob) return oa - ob;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function especialDe(item: ListResponse): CarpetaBuzon["especial"] {
  if (item.path.toUpperCase() === "INBOX") return "inbox";
  switch (item.specialUse) {
    case "\\Sent":
      return "sent";
    case "\\Drafts":
      return "drafts";
    case "\\Trash":
      return "trash";
    case "\\Junk":
      return "junk";
    default:
      return undefined;
  }
}

const NOMBRES_ESPECIAL: Record<NonNullable<CarpetaBuzon["especial"]>, string> = {
  inbox: "Bandeja de entrada",
  sent: "Enviados",
  drafts: "Borradores",
  trash: "Papelera",
  junk: "Spam",
};

export async function listarCarpetas(): Promise<CarpetaBuzon[]> {
  return conConexionImap(async (client) => {
    const lista = await client.list();
    const carpetas: CarpetaBuzon[] = lista
      // "\Noselect" son nodos puramente jerárquicos (no contienen mensajes),
      // ej. el "INBOX." padre en servidores Dovecot con namespace prefijado.
      .filter((item) => !item.flags?.has("\\Noselect"))
      .map((item) => {
        const especial = especialDe(item);
        return { path: item.path, nombre: especial ? NOMBRES_ESPECIAL[especial] : item.name, especial };
      });
    return ordenarCarpetas(carpetas);
  });
}

function tieneAdjuntosStructure(node?: MessageStructureObject): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  return (node.childNodes || []).some(tieneAdjuntosStructure);
}

function formatearRemitente(from?: { name?: string; address?: string }[]): { de: string; email: string } {
  const primero = from?.[0];
  return { de: primero?.name || primero?.address || "(desconocido)", email: primero?.address || "" };
}

function resumenDeMensaje(msg: FetchMessageObject): CorreoResumen {
  const { de, email } = formatearRemitente(msg.envelope?.from);
  return {
    uid: msg.uid,
    asunto: msg.envelope?.subject || "(sin asunto)",
    de,
    deEmail: email,
    fecha: (msg.envelope?.date ? new Date(msg.envelope.date) : new Date()).toISOString(),
    leido: msg.flags?.has("\\Seen") ?? false,
    tieneAdjuntos: tieneAdjuntosStructure(msg.bodyStructure),
  };
}

// Trae los últimos `limite` correos de una carpeta, más recientes primero.
// Solo pide ENVELOPE/FLAGS/BODYSTRUCTURE (liviano) — el cuerpo completo se
// pide aparte, un mensaje a la vez, en obtenerCorreo.
export async function listarCorreos(carpetaPath: string, limite = LIMITE_LISTA_DEFAULT): Promise<CorreoResumen[]> {
  return conConexionImap(async (client) => {
    const mailbox = await client.mailboxOpen(carpetaPath, { readOnly: true });
    if (!mailbox.exists) return [];
    const desde = Math.max(1, mailbox.exists - limite + 1);
    const filas: CorreoResumen[] = [];
    for await (const msg of client.fetch(`${desde}:*`, { envelope: true, flags: true, uid: true, bodyStructure: true })) {
      filas.push(resumenDeMensaje(msg));
    }
    filas.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return filas;
  });
}

function direcciones(addr?: AddressObject | AddressObject[]): string[] {
  if (!addr) return [];
  const grupos = Array.isArray(addr) ? addr : [addr];
  return grupos.flatMap((g) => g.value.map((v) => v.address || v.name || "")).filter(Boolean);
}

function listaTexto(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// Trae el correo completo (parseado con mailparser desde el mensaje crudo,
// una sola llamada IMAP) y lo marca como leído. La lista de adjuntos es solo
// metadata: el contenido se pide aparte con obtenerAdjunto para no inflar
// esta respuesta con archivos grandes que nadie pidió descargar.
export async function obtenerCorreo(carpetaPath: string, uid: number): Promise<CorreoDetalle | null> {
  return conConexionImap(async (client) => {
    await client.mailboxOpen(carpetaPath);
    const msg = await client.fetchOne(uid, { source: true, flags: true, uid: true }, { uid: true });
    if (!msg || !msg.source) return null;
    const parsed = await simpleParser(msg.source);
    await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });

    const { de, email } = formatearRemitente(parsed.from?.value);
    const adjuntos: AdjuntoCorreo[] = parsed.attachments.map((a, indice) => ({
      indice,
      nombre: a.filename || `adjunto-${indice + 1}`,
      tipo: a.contentType,
      tamano: a.size,
    }));

    return {
      uid,
      asunto: parsed.subject || "(sin asunto)",
      de,
      deEmail: email,
      fecha: (parsed.date || new Date()).toISOString(),
      leido: true,
      tieneAdjuntos: adjuntos.length > 0,
      para: direcciones(parsed.to),
      cc: direcciones(parsed.cc),
      html: parsed.html || undefined,
      texto: parsed.text,
      messageId: parsed.messageId,
      references: listaTexto(parsed.references),
      adjuntos,
    };
  });
}

// Descarga el contenido de un adjunto puntual — vuelve a bajar y parsear el
// mensaje (no hay caché entre requests, ver comentario en cliente.ts), el
// costo es aceptable porque solo ocurre cuando el usuario pide ese adjunto
// específico, no al listar o abrir el correo.
export async function obtenerAdjunto(carpetaPath: string, uid: number, indice: number): Promise<AdjuntoDescargado | null> {
  return conConexionImap(async (client) => {
    await client.mailboxOpen(carpetaPath, { readOnly: true });
    const msg = await client.fetchOne(uid, { source: true }, { uid: true });
    if (!msg || !msg.source) return null;
    const parsed = await simpleParser(msg.source);
    const adjunto = parsed.attachments[indice];
    if (!adjunto) return null;
    return { nombre: adjunto.filename || `adjunto-${indice + 1}`, tipo: adjunto.contentType, base64: adjunto.content.toString("base64") };
  });
}
