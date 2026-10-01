import { NextResponse } from "next/server";
import { tieneModulo } from "@/lib/session";

// Fotos, audios y stickers que mandan los clientes: el webhook solo trae el
// id del archivo (ver manejarMensajeEntrante en ../../route), y bajarlo pide
// el token de Meta, así que el chat de MensajesView los pide por acá. Meta
// los guarda ~30 días; después esto responde 404 y el chat muestra el aviso.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await tieneModulo("mensajes"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const token = process.env.META_WHATSAPP_TOKEN;
  // Solo dígitos: el id va pegado a la URL de la Graph API.
  if (!/^\d+$/.test(id) || !token) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`https://graph.facebook.com/v25.0/${id}`, { headers: auth });
  const info = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string } | null;
  if (!meta.ok || !info?.url) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const archivo = await fetch(info.url, { headers: auth });
  if (!archivo.ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return new NextResponse(archivo.body, {
    headers: { "Content-Type": info.mime_type || "application/octet-stream", "Cache-Control": "private, max-age=86400" },
  });
}
