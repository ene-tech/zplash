// Sube un video como Reel al perfil empresa de Instagram, por la API de
// publicación de contenido de Meta (Graph API). El video se sube desde el disco
// (subida "resumable"), no hace falta tenerlo en una URL pública.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/instagram-reel.mts --cuenta
//       muestra la cuenta de Instagram ligada al token (para sacar META_IG_USER_ID)
//   npx tsx --env-file=.env.local scripts/instagram-reel.mts --listar
//       últimos 10 Reels/posts con link, likes y comentarios
//   npx tsx --env-file=.env.local scripts/instagram-reel.mts video.mp4 --texto "caption" [--portada-ms 1500] [--probar]
//       sube y publica. Con --probar sube y espera que Meta lo procese, pero NO
//       lo publica (el contenedor sin publicar caduca solo a las 24 h).
//       --texto-archivo caption.txt sirve para captions largos con saltos de línea.
//
// Necesita en .env.local:
//  - META_IG_TOKEN    token (ideal: usuario del sistema del Business Manager) con
//                     instagram_basic, instagram_content_publish, pages_show_list,
//                     pages_read_engagement y business_management
//  - META_IG_USER_ID  id de la cuenta de Instagram empresa (lo da --cuenta)
//
// Límites de Meta: 50 publicaciones por API cada 24 h; Reel de 3 s a 15 min,
// MP4/MOV, H.264, 9:16 recomendado; caption hasta 2.200 caracteres y 30 hashtags.
import { readFileSync, statSync } from "node:fs";

const V = "v25.0";
const token = process.env.META_IG_TOKEN;
if (!token) {
  console.error("Falta META_IG_TOKEN en .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const valor = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function graph(ruta: string, params: Record<string, string> = {}, method = "GET") {
  const qs = new URLSearchParams({ ...params, access_token: token! });
  const res = await fetch(`https://graph.facebook.com/${V}/${ruta}?${qs}`, { method });
  const json = await res.json();
  if (json.error) throw new Error(`${ruta}: ${json.error.message}`);
  return json;
}

if (flag("--cuenta")) {
  const r = await graph("me/accounts", { fields: "name,instagram_business_account{id,username,followers_count}" });
  for (const p of r.data) {
    const ig = p.instagram_business_account;
    console.log(`Página "${p.name}" → ${ig ? `@${ig.username} (${ig.followers_count} seguidores)  META_IG_USER_ID=${ig.id}` : "sin Instagram empresa ligado"}`);
  }
  if (!r.data.length) console.log("El token no ve ninguna página: falta asignarle la página al usuario del sistema.");
  process.exit(0);
}

const igId = process.env.META_IG_USER_ID;
if (!igId) {
  console.error("Falta META_IG_USER_ID en .env.local (correr con --cuenta para sacarlo)");
  process.exit(1);
}

if (flag("--listar")) {
  const r = await graph(`${igId}/media`, {
    fields: "timestamp,media_product_type,permalink,like_count,comments_count,caption",
    limit: "10",
  });
  for (const m of r.data) {
    const texto = (m.caption ?? "").replace(/\s+/g, " ").slice(0, 60);
    console.log(`${m.timestamp.slice(0, 10)}  ${m.media_product_type.padEnd(5)}  ♥${m.like_count} 💬${m.comments_count}  ${m.permalink}  ${texto}`);
  }
  process.exit(0);
}

const conValor = ["--texto", "--texto-archivo", "--portada-ms"];
const archivo = args.find((a, i) => !a.startsWith("--") && !conValor.includes(args[i - 1]));
if (!archivo) {
  console.error("Falta el video. Ej: scripts/instagram-reel.mts reel.mp4 --texto \"...\"");
  process.exit(1);
}
const textoArchivo = valor("--texto-archivo");
const caption = textoArchivo ? readFileSync(textoArchivo, "utf8").trim() : (valor("--texto") ?? "");
if (caption.length > 2200) {
  console.error(`El caption tiene ${caption.length} caracteres; Instagram acepta 2.200.`);
  process.exit(1);
}
const tamano = statSync(archivo).size;

// 1) Contenedor del Reel
const params: Record<string, string> = {
  media_type: "REELS",
  upload_type: "resumable",
  caption,
  share_to_feed: "true",
};
const portada = valor("--portada-ms");
if (portada) params.thumb_offset = portada;
const { id: contenedor, uri } = await graph(`${igId}/media`, params, "POST");
console.log(`Contenedor ${contenedor}. Subiendo ${(tamano / 1e6).toFixed(1)} MB...`);

// 2) Subida del archivo
const subida = await fetch(uri ?? `https://rupload.facebook.com/ig-api-upload/${V}/${contenedor}`, {
  method: "POST",
  headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(tamano) },
  body: readFileSync(archivo),
});
const subidaJson = await subida.json();
if (!subida.ok || subidaJson.success === false) throw new Error(`Subida: ${JSON.stringify(subidaJson)}`);

// 3) Esperar que Meta procese el video (suele tardar 30 s a un par de minutos)
for (let i = 0; ; i++) {
  const { status_code, status } = await graph(contenedor, { fields: "status_code,status" });
  if (status_code === "FINISHED") break;
  if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Meta rechazó el video: ${status}`);
  if (i >= 60) throw new Error("Pasaron 10 minutos y Meta no termina de procesar; reintentar más tarde.");
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("\nProcesado.");

if (flag("--probar")) {
  console.log("Modo --probar: no se publicó. El contenedor caduca solo en 24 h.");
  process.exit(0);
}

// 4) Publicar
const { id: media } = await graph(`${igId}/media_publish`, { creation_id: contenedor }, "POST");
const { permalink } = await graph(media, { fields: "permalink" });
console.log(`Publicado: ${permalink}`);
