import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { subirFotoFila } from "@/lib/dataAccess/storage";

export const runtime = "nodejs";

// Entrada de la foto de la fila: la manda el PC del local
// (scripts/subir-foto-fila.ps1), que es el único que ve la cámara Hikvision
// por LAN. El sentido de que el local empuje hacia afuera, y no que el
// servidor entre a buscar la imagen, es no tener que abrir un puerto al NVR:
// un Hikvision expuesto a internet es blanco conocido.
//
// Autenticación por secreto compartido en un header, mismo criterio que las
// rutas de cron (CRON_SECRET): no hay sesión de usuario detrás, es una
// máquina.
const MAX_BYTES = 3 * 1024 * 1024;
const MIN_BYTES = 1000;

function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.CAMARA_FILA_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretoValido(request.headers.get("x-camara-secret"))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  // El script manda el JPEG crudo que devolvió ISAPI. Si la cámara respondió
  // un error (Hikvision contesta XML con 200 en varios casos) o la descarga
  // quedó a medias, pisar la última foto buena con eso dejaría la sección
  // mostrando basura hasta el próximo ciclo -- mejor rechazarlo y quedarse
  // con la anterior, que fotoFilaFresca descartará sola si envejece.
  if (bytes.length < MIN_BYTES || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return NextResponse.json({ ok: false, error: "No es un JPEG válido" }, { status: 400 });
  }

  if (!(await subirFotoFila(bytes))) {
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
