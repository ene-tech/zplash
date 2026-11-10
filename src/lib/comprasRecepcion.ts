import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { insertarDocumentosCompra } from "@/lib/dataAccess";
import {
  decodificarXml,
  esDocumentoSinMonto,
  parsearDtes,
} from "@/lib/dteCompra";
import { limpiarRut } from "@/lib/helpers/validadores";

// Lee facturascompra@zplash.cl (correo de intercambio del SII, mismo
// servidor de BanaHosting que el buzón info@) y guarda en documentos_compra
// cada DTE que venga en un adjunto XML. Corre desde el cron
// /api/compras/recibir y desde el botón "Revisar correo" de la pestaña.
//
// Un correo ya leído se marca con la palabra clave IMAP ZplashLeido y no se vuelve
// a abrir; no se usa \Seen porque abrirlo en el Webmail también lo marca
// visto. Solo se marca después de que la base confirmó el guardado: si
// falla, el próximo intento lo vuelve a procesar (el id del documento evita
// duplicados).
const LEIDO = "ZplashLeido";
const MAX_CORREOS_POR_PASADA = 40;

export interface ResultadoRecepcionCompras {
  ok: boolean;
  correos: number;
  documentos: number;
  nuevos: number;
  deOtroReceptor: number;
  error?: string;
}

export async function recibirDocumentosCompra(): Promise<ResultadoRecepcionCompras> {
  const host = process.env.MAIL_IMAP_HOST;
  const port = Number(process.env.MAIL_IMAP_PORT || 993);
  const user = process.env.FACTURAS_COMPRA_MAIL_USER;
  const pass = process.env.FACTURAS_COMPRA_MAIL_PASSWORD;
  const vacio = { correos: 0, documentos: 0, nuevos: 0, deOtroReceptor: 0 };
  if (!host || !user || !pass) {
    return {
      ok: false,
      ...vacio,
      error:
        "Falta configurar la casilla (MAIL_IMAP_HOST, FACTURAS_COMPRA_MAIL_USER, FACTURAS_COMPRA_MAIL_PASSWORD)",
    };
  }
  // Documentos emitidos a otro RUT (p. ej. copias de lo que emite la propia
  // Zplash) no son compras: se descartan. Sin la variable no se filtra.
  const rutPropio = process.env.SIMPLEFACTURA_RUT_EMISOR
    ? limpiarRut(process.env.SIMPLEFACTURA_RUT_EMISOR)
    : null;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    return {
      ok: false,
      ...vacio,
      error: `No se pudo entrar a la casilla: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const resultado = { ...vacio };
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Sin palabras clave permanentes la marca no queda y se releerían
      // siempre los mismos correos: mejor avisar que procesar a medias.
      const flags = client.mailbox ? client.mailbox.permanentFlags : undefined;
      if (flags && !flags.has("\\*") && !flags.has(LEIDO)) {
        return {
          ok: false,
          ...resultado,
          error:
            "La casilla no acepta marcar correos como leídos por la app (palabras clave IMAP)",
        };
      }
      const uids = (
        (await client.search({ unKeyword: LEIDO }, { uid: true })) || []
      ).slice(0, MAX_CORREOS_POR_PASADA);
      const fallidos: string[] = [];
      for (const uid of uids) {
        // Un correo que falla no frena a los demás: se sigue con el resto y
        // ese queda sin marca para reintentarlo en la próxima pasada.
        try {
          resultado.nuevos += await procesarCorreo(
            client,
            uid,
            rutPropio,
            resultado,
          );
          await client.messageFlagsAdd(String(uid), [LEIDO], { uid: true });
        } catch (e) {
          console.error(
            `Facturas de compra: no se pudo procesar el correo uid ${uid}`,
            e,
          );
          fallidos.push(
            `${uid}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (fallidos.length) {
        return {
          ok: false,
          ...resultado,
          error: `${fallidos.length} correo(s) no se pudieron procesar y se reintentan en la próxima pasada (${fallidos.join("; ").slice(0, 300)})`,
        };
      }
    } finally {
      lock.release();
    }
    return { ok: true, ...resultado };
  } catch (e) {
    return {
      ok: false,
      ...resultado,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Guarda los DTE de un correo. Devuelve cuántos eran nuevos; lanza si la
 * base no confirmó el guardado (el correo queda sin marca). */
async function procesarCorreo(
  client: ImapFlow,
  uid: number,
  rutPropio: string | null,
  resultado: Omit<ResultadoRecepcionCompras, "ok" | "error">,
): Promise<number> {
  const msg = await client.fetchOne(
    String(uid),
    { source: true },
    { uid: true },
  );
  if (!msg || !msg.source) return 0;
  const correo = await simpleParser(msg.source);
  resultado.correos++;
  const filas = [];
  for (const adj of correo.attachments) {
    const nombre = (adj.filename || "").toLowerCase();
    if (!nombre.endsWith(".xml") && !/xml/i.test(adj.contentType)) continue;
    for (const dte of parsearDtes(decodificarXml(adj.content))) {
      resultado.documentos++;
      if (
        rutPropio &&
        dte.rutReceptor &&
        limpiarRut(dte.rutReceptor) !== rutPropio
      ) {
        resultado.deOtroReceptor++;
        continue;
      }
      filas.push({
        id: dte.id,
        tipoDte: dte.tipoDte,
        folio: dte.folio,
        fechaEmision: dte.fechaEmision,
        rutEmisor: dte.rutEmisor,
        razonSocialEmisor: dte.razonSocialEmisor,
        montoNeto: dte.montoNeto,
        montoExento: dte.montoExento,
        iva: dte.iva,
        montoTotal: dte.montoTotal,
        detalle: dte.detalle,
        xml: dte.xml,
        fechaVencimiento: dte.fechaVencimiento ?? null,
        giroEmisor: dte.giroEmisor ?? null,
        correoDe: correo.from?.value?.[0]?.address ?? null,
        correoAsunto: correo.subject?.slice(0, 300) ?? null,
        estado: esDocumentoSinMonto(dte.tipoDte) ? "ignorado" : "pendiente",
      });
    }
  }
  const nuevos = await insertarDocumentosCompra(filas);
  if (nuevos === null) throw new Error("la base no guardó los documentos");
  return nuevos;
}
