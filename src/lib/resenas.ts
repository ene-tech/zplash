import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { conConexionImap, usuarioBuzon } from "@/lib/buzon/cliente";
import { enviarCorreoTransaccional } from "@/lib/mailing/proveedor";
import { claveAnthropic } from "@/lib/whatsapp/agente";
import { simpleParser } from "mailparser";

// Borradores de respuesta a reseñas de Google. La API de Business Profile
// rechazó el acceso (un solo local) y la Places API no ordena por fecha, así
// que la fuente es el correo de aviso que Google manda a info@zplash.cl por
// cada reseña. Claude escribe el borrador y llega por correo con el link
// "Responder" de Google: publicar sigue siendo a mano (copiar y pegar).
// Los avisos agrupados ("tienes 4 opiniones nuevas") no traen las reseñas y
// se ignoran.

const REMITENTE = "businessprofile-noreply@google.com";
// Marca IMAP propia (el buzón acepta \*): un aviso con esta marca ya tuvo su
// borrador, así el cron puede correr seguido sin repetir.
const MARCA = "ZplashBorrador";

export interface ResenaAviso {
  autor: string;
  estrellas: number | null;
  // Google corta las reseñas largas con "..." en el aviso.
  texto: string;
  linkResponder: string | null;
}

export function parsearAviso(asunto: string, cuerpo: string): ResenaAviso {
  const autor = asunto.match(/^(.*?) dejó una opini/)?.[1]?.trim() || "Cliente";
  const estrellas = Number(cuerpo.match(/opini[oó]n de\s+(\d)\s+estrella/)?.[1]) || null;
  const linkResponder = cuerpo.match(/Responder la opini[oó]n\s*<(https:[^>]+)>/)?.[1] ?? null;

  // El texto va entre "Leer la opinión <link>" + nombre completo y "Responder la opinión".
  const bloque = cuerpo.split(/Leer la opini[oó]n\s*<[^>]*>/)[1]?.split(/Responder la opini[oó]n/)[0] ?? "";
  let lineas = bloque.split("\n").map((l) => l.trim()).filter(Boolean).slice(1);
  const original = lineas.indexOf("(Original)");
  if (original >= 0) lineas = lineas.slice(original + 1);
  const texto = lineas.join(" ").replace("Este usuario solo dejó una calificación", "").trim();

  return { autor, estrellas, texto, linkResponder };
}

const INSTRUCCIONES = `Escribes respuestas públicas a reseñas de Google para Zplash AutoLavado, un lavado de autos en Temuco, Chile.
- Español de Chile, cercano y breve: 1 a 3 frases. Trata de tú.
- Saluda por el primer nombre si parece nombre de persona.
- Si la reseña menciona algo concreto, refiérete a eso. Si viene cortada en "...", no inventes cómo sigue.
- Si es negativa: agradece, reconoce el problema sin discutir ni dar excusas, e invita a escribir a info@zplash.cl o por WhatsApp para resolverlo.
- Las respuestas se publican una al lado de la otra: varía el saludo y el cierre, evita frases hechas como "te esperamos de vuelta cuando quieras".
- No inventes promociones, precios, nombres de empleados ni datos del cliente. No uses emojis ni hashtags.
Responde solo con el texto de la respuesta.`;

let cliente: Anthropic | undefined;
export async function redactar(r: ResenaAviso): Promise<string> {
  cliente ??= new Anthropic({ apiKey: claveAnthropic(), timeout: 60_000 });
  const respuesta = await cliente.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: INSTRUCCIONES,
    messages: [
      {
        role: "user",
        content: `Autor: ${r.autor}\nEstrellas: ${r.estrellas ?? "desconocidas"}\nReseña: ${r.texto || "(solo dejó la calificación, sin texto)"}`,
      },
    ],
  });
  if (respuesta.stop_reason === "refusal") throw new Error("Claude no quiso redactar la respuesta");
  return respuesta.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function correoBorrador(r: ResenaAviso, borrador: string): { subject: string; html: string } {
  const estrellas = r.estrellas ? "★".repeat(r.estrellas) + "☆".repeat(5 - r.estrellas) : "¿?";
  const revisar = !r.estrellas || r.estrellas <= 3;
  const boton = r.linkResponder
    ? `<p><a href="${escapeHtml(r.linkResponder)}" style="display:inline-block;background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Responder en Google</a></p>`
    : "";
  return {
    subject: `${revisar ? "⚠️ Revisar: " : ""}Reseña ${estrellas} de ${r.autor} — borrador de respuesta`,
    html: `<div style="font-family:sans-serif;max-width:560px">
<p><b>${escapeHtml(r.autor)}</b> · ${estrellas}</p>
<blockquote style="margin:0 0 16px;padding-left:12px;border-left:3px solid #ccc;color:#555">${escapeHtml(r.texto || "(solo calificación, sin texto)")}</blockquote>
<p style="color:#888;font-size:13px;margin-bottom:4px">Borrador (cópialo y pégalo en Google):</p>
<div style="padding:12px;background:#f4f6f8;border-radius:6px;white-space:pre-wrap">${escapeHtml(borrador)}</div>
${boton}
</div>`,
  };
}

export interface ResultadoResenas {
  avisos: number;
  borradores: number;
  errores: string[];
}

// Revisa los avisos de reseña sin marca de los últimos 7 días (para que el
// primer día no reprocese todo el historial) y manda un borrador por cada uno.
// Un aviso solo se marca si el correo salió: si falla, se reintenta en la
// siguiente corrida.
export async function procesarAvisosResenas(): Promise<ResultadoResenas> {
  const resultado: ResultadoResenas = { avisos: 0, borradores: 0, errores: [] };
  const destino = process.env.RESENAS_AVISAR_A || usuarioBuzon();

  await conConexionImap(async (client) => {
    await client.mailboxOpen("INBOX");
    const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const uids = (await client.search({ from: REMITENTE, subject: "dejó una opinión", since: desde, unKeyword: MARCA }, { uid: true })) || [];
    resultado.avisos = uids.length;

    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const resena = parsearAviso(parsed.subject || "", parsed.text || "");
        const borrador = await redactar(resena);
        const envio = await enviarCorreoTransaccional({ to: destino, ...correoBorrador(resena, borrador) });
        if (!envio.ok) throw new Error(envio.error || "no se pudo enviar el correo");
        await client.messageFlagsAdd([uid], [MARCA], { uid: true });
        resultado.borradores++;
      } catch (error) {
        console.error("Reseñas: falló el aviso", uid, error);
        resultado.errores.push(`${uid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  return resultado;
}
