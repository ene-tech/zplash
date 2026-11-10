import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { avanzarCola, type ItemCola, type MetaContenido } from "@/lib/redes/colaContenido";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Disparado cada 15 minutos por el cron de Vercel (vercel.json): da un paso de
// la cola de Instagram — ver @/lib/redes/colaContenido. La cola y los videos
// viven en el bucket privado "redes-sociales"; se cargan con
// scripts/cargar-contenido-redes.mts.
const BUCKET = "redes-sociales";
const COLA = "cola.json";
const API = "https://graph.facebook.com/v25.0";
const PAGINA = process.env.META_ADS_PAGE_ID || "469580279582351";

async function graph(ruta: string, params: Record<string, string> = {}, metodo: "GET" | "POST" = "GET") {
  const url = new URL(`${API}/${ruta}`);
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${process.env.META_ADS_TOKEN}` } };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  const body = await (await fetch(url, init)).json();
  if (body.error) throw new Error(body.error.error_user_msg ?? body.error.message);
  return body;
}

export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;
  if (!process.env.META_ADS_TOKEN) {
    console.error("Falta META_ADS_TOKEN: no se publica en Instagram");
    return NextResponse.json({ error: "Falta META_ADS_TOKEN" }, { status: 500 });
  }

  const storage = getSupabaseAdmin().storage.from(BUCKET);
  const { data: archivo, error } = await storage.download(COLA);
  if (error || !archivo) return NextResponse.json({ ok: true, paso: "sin cola" });
  const cola: ItemCola[] = JSON.parse(await archivo.text());

  let ig: string | undefined;
  const cuentaIg = async () =>
    (ig ??= (await graph(PAGINA, { fields: "instagram_business_account" })).instagram_business_account.id as string);

  const meta: MetaContenido = {
    async crearContenedor(tipo, videoUrl, caption) {
      const params: Record<string, string> = { media_type: tipo, video_url: videoUrl };
      if (caption) Object.assign(params, { caption, share_to_feed: "true" });
      return (await graph(`${await cuentaIg()}/media`, params, "POST")).id;
    },
    estado: (contenedor) => graph(contenedor, { fields: "status_code,status" }),
    async publicar(contenedor) {
      return (await graph(`${await cuentaIg()}/media_publish`, { creation_id: contenedor }, "POST")).id;
    },
  };

  const paso = await avanzarCola(
    cola,
    new Date(),
    meta,
    async (ruta) => {
      // 2 h: Meta descarga el video al crear el contenedor, no al publicar.
      const { data, error } = await storage.createSignedUrl(ruta, 2 * 60 * 60);
      if (error || !data) throw new Error(`No se pudo firmar ${ruta}: ${error?.message}`);
      return data.signedUrl;
    },
    async () => {
      const { error } = await storage.upload(COLA, JSON.stringify(cola, null, 2), {
        upsert: true,
        contentType: "application/json",
      });
      if (error) throw new Error(`No se pudo guardar la cola: ${error.message}`);
    }
  );
  if (paso.includes("falló")) console.error("Instagram:", paso);
  else console.log("Instagram:", paso);
  return NextResponse.json({ ok: true, paso });
}
