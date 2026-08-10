import { NextRequest, NextResponse } from "next/server";
import { enviarCorreo, type AdjuntoParaEnviar } from "@/lib/buzon/enviar";
import { tieneModulo } from "@/lib/session";
import type { EnvioCorreo } from "@/types";

// nodemailer/imapflow necesitan APIs de Node (Buffer, TLS) que no existen en
// el runtime Edge.
export const runtime = "nodejs";

function listaDesdeFormData(formData: FormData, campo: string): string[] {
  return formData
    .getAll(campo)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

// Recibe la redacción/respuesta de un correo como multipart/form-data en vez
// de un Server Action: los Server Actions de Next capan el body a 1MB por
// defecto (ver node_modules/next/dist/docs/.../server-actions.md,
// "Body size limit"), insuficiente para adjuntos reales. Mismo patrón que
// /api/conciliacion/parsear-cartola.
export async function POST(request: NextRequest) {
  try {
    if (!(await tieneModulo("correo"))) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const para = listaDesdeFormData(formData, "para");
    const cc = listaDesdeFormData(formData, "cc");
    const bcc = listaDesdeFormData(formData, "bcc");
    const asunto = String(formData.get("asunto") || "").trim();
    const html = String(formData.get("html") || "");
    const inReplyTo = String(formData.get("inReplyTo") || "") || undefined;
    const references = listaDesdeFormData(formData, "references");

    if (!para.length || !asunto || !html.trim()) {
      return NextResponse.json({ ok: false, error: "Faltan destinatario, asunto o cuerpo del correo" }, { status: 400 });
    }

    const envio: EnvioCorreo = {
      para,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      asunto,
      html,
      inReplyTo,
      references: references.length ? references : undefined,
    };

    const archivos = formData.getAll("adjuntos").filter((v): v is File => v instanceof File && v.size > 0);
    const adjuntos: AdjuntoParaEnviar[] = await Promise.all(
      archivos.map(async (a) => ({ nombre: a.name, tipo: a.type || undefined, contenido: Buffer.from(await a.arrayBuffer()) }))
    );

    const resultado = await enviarCorreo(envio, adjuntos.length ? adjuntos : undefined);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
  } catch (error) {
    console.error("Error en /api/correo/enviar", error);
    return NextResponse.json({ ok: false, error: "No se pudo enviar el correo" }, { status: 500 });
  }
}
