import "server-only";

import type { MessageEnvelopeObject } from "imapflow";
import { conConexionImap } from "./cliente";
import { listarCarpetas } from "./leer";
import type { CondicionFiltroCorreo, ReglaFiltroCorreo, ResultadoFiltrosCorreo } from "@/types";

function campoTexto(envelope: MessageEnvelopeObject | undefined, campo: CondicionFiltroCorreo["campo"]): string {
  const direcciones = (lista?: { name?: string; address?: string }[]) => (lista || []).map((a) => `${a.name || ""} ${a.address || ""}`).join(" ");
  if (campo === "de") return direcciones(envelope?.from);
  if (campo === "para") return direcciones(envelope?.to);
  return envelope?.subject || "";
}

function condicionCumple(envelope: MessageEnvelopeObject | undefined, cond: CondicionFiltroCorreo): boolean {
  const contiene = campoTexto(envelope, cond.campo).toLowerCase().includes(cond.valor.toLowerCase());
  return cond.operador === "contiene" ? contiene : !contiene;
}

function reglaCumple(envelope: MessageEnvelopeObject | undefined, regla: ReglaFiltroCorreo): boolean {
  if (!regla.condiciones.length) return false;
  return regla.combinador === "todas"
    ? regla.condiciones.every((c) => condicionCumple(envelope, c))
    : regla.condiciones.some((c) => condicionCumple(envelope, c));
}

// Evalúa las reglas activas contra los correos no leídos de INBOX — llamado
// desde el cron diario (/api/correo/filtros/evaluar) y desde el botón
// "Aplicar ahora" del panel (ver serverActions/buzon.ts). Alternativa a
// Sieve real: el ManageSieve de Banahost (puerto 4190) no es alcanzable
// desde Vercel (ver comentario en @/db/schema/buzon), así que esto corre por
// IMAP normal en vez de en el servidor de correo mismo — no es instantáneo,
// solo se aplica cuando corre este cron o alguien aprieta "Aplicar ahora".
//
// "eliminar" mueve a Papelera en vez de purgar de verdad (más seguro: una
// regla mal configurada no debe poder destruir correo real sin posibilidad
// de recuperarlo) — si no hay carpeta Papelera detectada, esa acción se
// omite para ese correo (mejor no actuar que perder el mensaje).
export async function aplicarFiltrosCorreo(reglas: ReglaFiltroCorreo[]): Promise<ResultadoFiltrosCorreo> {
  const activas = reglas.filter((r) => r.activa && r.condiciones.length);
  const resultado: ResultadoFiltrosCorreo = { revisados: 0, movidos: 0, aPapelera: 0, marcadosLeidos: 0 };
  if (!activas.length) return resultado;

  try {
    const carpetas = await listarCarpetas();
    const papelera = carpetas.find((c) => c.especial === "trash")?.path;

    await conConexionImap(async (client) => {
      await client.mailboxOpen("INBOX");
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      resultado.revisados = uids.length;
      if (!uids.length) return;

      for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
        for (const regla of activas) {
          if (!reglaCumple(msg.envelope, regla)) continue;

          if (regla.accion === "mover" && regla.carpetaDestino) {
            await client.messageMove([msg.uid], regla.carpetaDestino, { uid: true });
            resultado.movidos++;
          } else if (regla.accion === "eliminar" && papelera) {
            await client.messageMove([msg.uid], papelera, { uid: true });
            resultado.aPapelera++;
          } else if (regla.accion === "marcar_leido") {
            await client.messageFlagsAdd([msg.uid], ["\\Seen"], { uid: true });
            resultado.marcadosLeidos++;
          } else {
            continue; // acción no aplicable (ej. "mover" sin carpetaDestino) — no cuenta como match real
          }

          if (regla.detenerEvaluacion) break;
        }
      }
    });
  } catch (error) {
    console.error("Error aplicando filtros de correo", error);
    resultado.error = "No se pudo conectar al buzón";
  }

  return resultado;
}
