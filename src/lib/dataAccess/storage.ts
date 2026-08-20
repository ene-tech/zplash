import "server-only";

import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const COMPROBANTES_BUCKET = "comprobantes-gastos";

/** Sube el comprobante (boleta/factura escaneada) de un egreso y devuelve su URL pública, o null si falló. */
export async function subirComprobanteGasto(id: string, file: File): Promise<string | null> {
  const path = `${id}-${file.name}`;
  const { error } = await supabase.storage.from(COMPROBANTES_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    console.error("Error subiendo comprobante", error);
    return null;
  }
  const { data } = supabase.storage.from(COMPROBANTES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const BANNERS_SERVICIOS_BUCKET = "banners-servicios";

/** Sube la imagen de banner de un servicio (Web Settings) y devuelve su URL pública, o null si falló. */
export async function subirBannerServicio(servicioId: string, file: File): Promise<string | null> {
  const path = `${servicioId}-${file.name}`;
  const { error } = await supabase.storage.from(BANNERS_SERVICIOS_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    console.error("Error subiendo banner de servicio", error);
    return null;
  }
  const { data } = supabase.storage.from(BANNERS_SERVICIOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const CAMARA_FILA_BUCKET = "camara-fila";
const CAMARA_FILA_PATH = "actual.jpg";

/** Pisa la única foto del bucket con la última que mandó el script del local. true si quedó guardada. */
export async function subirFotoFila(bytes: Uint8Array): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .storage.from(CAMARA_FILA_BUCKET)
    .upload(CAMARA_FILA_PATH, bytes, { upsert: true, contentType: "image/jpeg" });
  if (error) {
    console.error("Error subiendo foto de la fila", error);
    return false;
  }
  return true;
}

/**
 * URL firmada corta de la última foto de la fila + cuándo se subió, o null si
 * todavía no hay ninguna. Firmada y no pública porque el bucket es privado
 * (ver supabase/add-camara-fila.sql): la URL la entrega /api/cliente/fila
 * solo después de verificar sesión y plan vigente, y expira en 60s para que
 * no sirva de enlace permanente compartible.
 */
export async function leerFotoFila(): Promise<{ url: string; capturadoEn: string | null } | null> {
  const admin = getSupabaseAdmin();
  // list() en vez de un campo propio en la base: el bucket ya guarda
  // updated_at por objeto, y es el único dato que falta (ver fotoFilaFresca).
  const { data: archivos } = await admin.storage.from(CAMARA_FILA_BUCKET).list("", { search: CAMARA_FILA_PATH });
  const archivo = archivos?.find((a) => a.name === CAMARA_FILA_PATH);
  if (!archivo) return null;

  const { data, error } = await admin.storage.from(CAMARA_FILA_BUCKET).createSignedUrl(CAMARA_FILA_PATH, 60);
  if (error || !data) {
    console.error("Error firmando la foto de la fila", error);
    return null;
  }
  return { url: data.signedUrl, capturadoEn: archivo.updated_at };
}
