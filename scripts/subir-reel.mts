// Publica un reel en el Instagram de Zplash con la API de Instagram (Graph API
// de Meta), sin pasar por el celular.
//
// Meta no recibe el archivo: hay que darle una URL pública de donde lo
// descarga. Por eso el script sube el video a un bucket privado "reels" de
// Supabase Storage (lo crea si no existe), le pasa a Meta una URL firmada que
// dura 1 hora y borra el archivo apenas el reel queda publicado.
//
// Flujo de la API: 1) crear el contenedor (media_type=REELS), 2) esperar a que
// Meta termine de procesar el video (status_code FINISHED), 3) publicarlo.
//
// Requisitos del video (los valida Meta, no este script): MP4/MOV, H.264,
// vertical 9:16 recomendado, entre 3 s y 15 min. El plan de Supabase limita
// el archivo a 50 MB.
//
// Variables en .env.local:
//   META_INSTAGRAM_TOKEN  token con instagram_basic + instagram_content_publish
//                         (+ pages_show_list y pages_read_engagement)
//   META_IG_USER_ID       id de la cuenta de Instagram Business de Zplash
//
// Uso:
//   npx tsx --env-file=.env.local scripts/subir-reel.mts --verificar
//       -> revisa el token y muestra los ids de Instagram que ve (para llenar META_IG_USER_ID)
//   npx tsx --env-file=.env.local scripts/subir-reel.mts <video.mp4> "texto del reel" [--no-feed]
//       -> publica de verdad. --no-feed lo deja solo en la pestaña Reels.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.facebook.com/v25.0";
const token = process.env.META_INSTAGRAM_TOKEN;
if (!token) {
  console.error("Falta META_INSTAGRAM_TOKEN en .env.local");
  process.exit(1);
}

async function graph(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${token}`, init);
  const data = await res.json();
  if (data.error) throw new Error(`Meta respondió error en ${path.split("?")[0]}: ${JSON.stringify(data.error, null, 2)}`);
  return data;
}

if (process.argv.includes("--verificar")) {
  const debug = await graph(`debug_token?input_token=${token}`);
  const d = debug.data;
  console.log("Token válido:", d.is_valid, "| tipo:", d.type, "| vence:", d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "nunca");
  console.log("Permisos:", (d.scopes ?? []).join(", "));
  if (!(d.scopes ?? []).includes("instagram_content_publish")) console.log("⚠ Falta instagram_content_publish: no va a poder publicar.");
  const pages = await graph("me/accounts?fields=name,instagram_business_account{id,username}");
  for (const p of pages.data ?? []) {
    const ig = p.instagram_business_account;
    console.log(`Página "${p.name}" ->`, ig ? `Instagram @${ig.username}  META_IG_USER_ID=${ig.id}` : "sin Instagram vinculado");
  }
  if (!pages.data?.length) console.log("El token no ve ninguna página de Facebook (¿falta pages_show_list o el usuario no administra la página?).");
  process.exit(0);
}

const igUser = process.env.META_IG_USER_ID;
const [archivo, caption] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!igUser || !archivo || !caption) {
  console.error('Uso: subir-reel.mts <video.mp4> "texto" [--no-feed]   (y META_IG_USER_ID en .env.local; sacarlo con --verificar)');
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "reels";
const { error: errBucket } = await supabase.storage.createBucket(BUCKET, { public: false });
if (errBucket && !/already exists/i.test(errBucket.message)) throw errBucket;

const ruta = `${Date.now()}-${basename(archivo).replace(/[^\w.-]/g, "_")}`;
const contentType = extname(archivo).toLowerCase() === ".mov" ? "video/quicktime" : "video/mp4";
console.log("Subiendo el video a Supabase Storage...");
const { error: errUp } = await supabase.storage.from(BUCKET).upload(ruta, await readFile(archivo), { contentType });
if (errUp) throw errUp;

try {
  const { data: firmada, error: errSign } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600);
  if (errSign) throw errSign;

  console.log("Creando el reel en Instagram...");
  const contenedor = await graph(`${igUser}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: firmada.signedUrl,
      caption,
      share_to_feed: !process.argv.includes("--no-feed"),
    }),
  });

  // Meta procesa el video en segundo plano; suele tardar entre 30 s y un par de minutos.
  let estado = "";
  for (let i = 0; i < 60; i++) {
    const s = await graph(`${contenedor.id}?fields=status_code,status`);
    estado = s.status_code;
    if (estado === "FINISHED") break;
    if (estado === "ERROR" || estado === "EXPIRED") throw new Error(`Meta no pudo procesar el video: ${s.status}`);
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (estado !== "FINISHED") throw new Error("Meta no terminó de procesar el video en 5 minutos. Contenedor: " + contenedor.id);

  const publicado = await graph(`${igUser}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: contenedor.id }),
  });
  const info = await graph(`${publicado.id}?fields=permalink`);
  console.log("\nReel publicado:", info.permalink);
} finally {
  await supabase.storage.from(BUCKET).remove([ruta]);
}
