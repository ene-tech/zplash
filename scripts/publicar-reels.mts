// Publica en Instagram (@zplash.cl) el siguiente video pendiente de la cola:
// primero como reel (también en el feed) y después el mismo video como
// historia. Pensado para correr una vez al día desde el Programador de tareas
// de Windows (tarea "ZPlash reel diario"); cada corrida publica uno solo.
//
// Uso: npx tsx --env-file=.env.local scripts/publicar-reels.mts            publica el siguiente
//      npx tsx --env-file=.env.local scripts/publicar-reels.mts --probar   sube el siguiente a Meta
//                                     y espera que lo procese, pero NO lo publica
//
// La cola vive en scripts/meta-ads/reels-cola.json (fuera de git):
//   [{ "archivo": "C:/.../3.mp4", "caption": "...", "publicado": { reel, historia, fecha } }]
// Un video con "publicado" no se vuelve a subir. Si la historia falla, el reel
// queda igual marcado y la historia se reintenta en la próxima corrida.
//
// Necesita META_ADS_TOKEN con instagram_content_publish (usuario del sistema).
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";

const API = "https://graph.facebook.com/v25.0";
const PAGINA = process.env.META_ADS_PAGE_ID || "469580279582351";
const COLA = "scripts/meta-ads/reels-cola.json";
const LOG = "scripts/meta-ads/reels.log";
const token = process.env.META_ADS_TOKEN;
const probar = process.argv.includes("--probar");

type Item = { archivo: string; caption: string; publicado?: { reel?: string; historia?: string; fecha: string } };

const log = (msg: string) => {
  const linea = `${new Date().toISOString()} ${msg}`;
  console.log(linea);
  appendFileSync(LOG, linea + "\n");
};

async function graph(ruta: string, params: Record<string, string> = {}, metodo: "GET" | "POST" = "GET") {
  const url = new URL(`${API}/${ruta}`);
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  const body = await (await fetch(url, init)).json();
  if (body.error) throw new Error(`Meta: ${body.error.error_user_msg ?? body.error.message}`);
  return body;
}

// Sube el archivo por carga reanudable (no hace falta una URL pública) y
// espera a que Instagram termine de procesarlo. Devuelve el contenedor listo.
// La subida a rupload a veces responde ProcessingFailedError y a la segunda
// pasa (visto el 26-oct-2026 con un archivo que después subió bien): hasta 3
// intentos, cada uno con un contenedor nuevo.
async function subir(ig: string, item: Item, tipo: "REELS" | "STORIES", intento = 1): Promise<string> {
  const params: Record<string, string> = { media_type: tipo, upload_type: "resumable" };
  if (tipo === "REELS") Object.assign(params, { caption: item.caption, share_to_feed: "true" });
  const contenedor = await graph(`${ig}/media`, params, "POST");
  const res = await fetch(contenedor.uri, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(statSync(item.archivo).size) },
    body: readFileSync(item.archivo),
  });
  const subida = await res.json();
  if (!res.ok || subida.debug_info) {
    if (intento < 3) {
      log(`Subida de ${tipo} falló (intento ${intento}), reintentando: ${JSON.stringify(subida)}`);
      await new Promise((r) => setTimeout(r, 15000));
      return subir(ig, item, tipo, intento + 1);
    }
    throw new Error(`Subida de ${tipo}: ${JSON.stringify(subida)}`);
  }
  for (let i = 0; i < 60; i++) {
    const { status_code, status } = await graph(contenedor.id, { fields: "status_code,status" });
    if (status_code === "FINISHED") return contenedor.id;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Instagram no procesó el ${tipo}: ${status}`);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`El ${tipo} sigue procesándose después de 10 minutos`);
}

const cola: Item[] = JSON.parse(readFileSync(COLA, "utf8"));
const guardar = () => writeFileSync(COLA, JSON.stringify(cola, null, 2));

try {
  if (!token) throw new Error("Falta META_ADS_TOKEN en .env.local");
  const pagina = await graph(PAGINA, { fields: "instagram_business_account" });
  const ig: string = pagina.instagram_business_account.id;

  // Primero una historia que quedó pendiente de una corrida anterior.
  const sinHistoria = cola.find((x) => x.publicado?.reel && !x.publicado.historia);
  const siguiente = sinHistoria ?? cola.find((x) => !x.publicado);
  if (!siguiente) {
    log("Cola vacía: no hay videos pendientes.");
  } else if (probar) {
    const id = await subir(ig, siguiente, "REELS");
    log(`PRUEBA ok: ${siguiente.archivo} subido y procesado (contenedor ${id}), sin publicar.`);
  } else {
    if (!siguiente.publicado?.reel) {
      const reel = await graph(`${ig}/media_publish`, { creation_id: await subir(ig, siguiente, "REELS") }, "POST");
      siguiente.publicado = { reel: reel.id, fecha: new Date().toISOString() };
      guardar();
      log(`Reel publicado: ${siguiente.archivo} (${reel.id})`);
    }
    const historia = await graph(`${ig}/media_publish`, { creation_id: await subir(ig, siguiente, "STORIES") }, "POST");
    siguiente.publicado!.historia = historia.id;
    guardar();
    log(`Historia publicada: ${siguiente.archivo} (${historia.id})`);
  }
} catch (e) {
  log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
