import "server-only";

import { supabase } from "@/lib/supabase";

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

const CONTENIDO_WHATSAPP_BUCKET = "contenido-whatsapp";

/** Sube la imagen adjunta de la Opción 1/2 del bot de WhatsApp (Web Settings) y devuelve su URL pública, o null si falló. */
export async function subirImagenBotWhatsapp(clave: "precios" | "plan", file: File): Promise<string | null> {
  const path = `${clave}-${file.name}`;
  const { error } = await supabase.storage.from(CONTENIDO_WHATSAPP_BUCKET).upload(path, file, { upsert: true });
  if (error) {
    console.error("Error subiendo imagen del bot de WhatsApp", error);
    return null;
  }
  const { data } = supabase.storage.from(CONTENIDO_WHATSAPP_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
