import "server-only";
import { unstable_cache } from "next/cache";

// Reseñas de la ficha de Google del local para la cinta de la portada
// (26-nov-2026). Vienen de la Places API (New) de Google con la clave
// GOOGLE_PLACES_API_KEY (Vercel); sin clave o si Google falla, la cinta no se
// muestra: nunca se inventan reseñas. GOOGLE_PLACE_ID es opcional: si falta,
// se busca la ficha por nombre y dirección.
//
// Se cachea un día (unstable_cache): son ~30 llamadas al mes, dentro del uso
// gratis de Google. Un error se lanza dentro del caché para que NO quede
// guardado y la próxima visita vuelva a intentar.

export interface ResenaGoogle {
  autor: string;
  autorUrl?: string;
  foto?: string;
  estrellas: number;
  texto: string;
  hace: string;
}

export interface ResenasGoogle {
  rating: number;
  total: number;
  placeId: string;
  fichaUrl: string;
  resenas: ResenaGoogle[];
}

const BUSQUEDA = "Zplash Car Wash, Prieto Norte 71, Temuco, Chile";
const API = "https://places.googleapis.com/v1";

interface PlaceRespuesta {
  id?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }[];
}

async function buscarPlaceId(clave: string): Promise<string> {
  const res = await fetch(`${API}/places:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": clave, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: BUSQUEDA, languageCode: "es" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google searchText ${res.status}`);
  const data = (await res.json()) as { places?: { id?: string }[] };
  const id = data.places?.[0]?.id;
  if (!id) throw new Error("Google no encontró la ficha de Zplash");
  return id;
}

async function leerResenasGoogle(): Promise<ResenasGoogle> {
  const clave = process.env.GOOGLE_PLACES_API_KEY;
  if (!clave) throw new Error("Falta GOOGLE_PLACES_API_KEY");
  const placeId = process.env.GOOGLE_PLACE_ID || (await buscarPlaceId(clave));

  const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}?languageCode=es`, {
    headers: {
      "X-Goog-Api-Key": clave,
      "X-Goog-FieldMask": "id,rating,userRatingCount,googleMapsUri,reviews",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google place details ${res.status}`);
  const p = (await res.json()) as PlaceRespuesta;
  if (typeof p.rating !== "number" || !p.userRatingCount) throw new Error("La ficha de Google no trae calificación");

  const resenas: ResenaGoogle[] = (p.reviews ?? [])
    .map((r) => ({
      autor: r.authorAttribution?.displayName?.trim() || "Cliente de Google",
      autorUrl: r.authorAttribution?.uri,
      foto: r.authorAttribution?.photoUri,
      estrellas: r.rating ?? 0,
      texto: (r.text?.text || r.originalText?.text || "").trim(),
      hace: r.relativePublishTimeDescription ?? "",
    }))
    // Solo las que traen comentario: una cinta de estrellas sin texto no dice nada
    .filter((r) => r.texto.length > 0 && r.estrellas >= 4);

  return {
    rating: p.rating,
    total: p.userRatingCount,
    placeId: p.id || placeId,
    fichaUrl: p.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    resenas,
  };
}

const resenasCacheadas = unstable_cache(leerResenasGoogle, ["resenas-google-v1"], { revalidate: 60 * 60 * 24 });

/** Reseñas reales de Google, o null si no hay clave o Google no respondió. */
export async function getResenasGoogle(): Promise<ResenasGoogle | null> {
  if (!process.env.GOOGLE_PLACES_API_KEY) return null;
  try {
    return await resenasCacheadas();
  } catch (e) {
    console.error("[resenasGoogle]", e instanceof Error ? e.message : e);
    return null;
  }
}
