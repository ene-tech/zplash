import { NextRequest, NextResponse } from "next/server";
import { normPlate } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_REQUESTS = 15;
const VENTANA_MS = 5 * 60 * 1000;

// Recibe una foto tomada con la cámara del operador y la manda a Plate
// Recognizer (ver https://platerecognizer.com/) para leer la patente. La API
// key nunca llega al navegador: esta ruta corre server-side y es la única
// que la conoce. Si la lectura falla o no hay match, el operador sigue
// pudiendo escribir la patente a mano — esto es un atajo, no un reemplazo.
export async function POST(request: NextRequest) {
  // Try/catch a nivel de toda la función: si algo revienta antes de armar
  // la respuesta (ej. el body llega corrupto o excede algún límite de la
  // plataforma), Next.js devolvería una página de error que NO es JSON —
  // el cliente hace res.json() sobre eso y explota con un error genérico
  // que se confunde con "sin conexión". Acá siempre se devuelve JSON.
  try {
    if (rateLimited(`reconocer-patente:${clienteIp(request)}`, LIMITE_REQUESTS, VENTANA_MS)) {
      return NextResponse.json({ error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
    }

    const apiKey = process.env.PLATE_RECOGNIZER_API_KEY;
    if (!apiKey) {
      console.error("PLATE_RECOGNIZER_API_KEY no configurado");
      return NextResponse.json({ error: "No configurado" }, { status: 500 });
    }

    const formData = await request.formData();
    const imagen = formData.get("imagen");
    if (!(imagen instanceof File)) {
      return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
    }
    console.log("reconocer-patente: imagen recibida", imagen.size, "bytes,", imagen.type);

    const upstream = new FormData();
    upstream.append("upload", imagen);
    upstream.append("regions", "cl");

    const res = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const texto = await res.text();
      console.error("Error de Plate Recognizer", res.status, texto);
      return NextResponse.json({ error: `Plate Recognizer respondió ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { results?: { plate?: string; score?: number }[] };
    const top = data.results?.[0];
    if (!top?.plate) {
      return NextResponse.json({ patente: null });
    }
    return NextResponse.json({ patente: normPlate(top.plate), score: top.score ?? null });
  } catch (error) {
    console.error("Error en /api/reconocer-patente", error);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
