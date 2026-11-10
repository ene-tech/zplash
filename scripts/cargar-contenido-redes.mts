// Carga videos a la cola de Instagram que publica el cron /api/redes/publicar
// (ver src/lib/redes/colaContenido.ts). Se corre UNA vez por tanda desde el PC;
// después la publicación sale sola desde Vercel aunque el PC esté apagado.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/cargar-contenido-redes.mts --estado
//       muestra la cola y en qué va cada video
//   npx tsx --env-file=.env.local scripts/cargar-contenido-redes.mts tanda.json 2026-11-11 12:30
//       sube los videos de tanda.json y los agrega a la cola, uno por día
//       desde esa fecha a esa hora (hora de Chile)
//
// tanda.json: [{ "archivo": "C:/.../video.mp4", "caption": "..." }]
// Cada video tiene que pesar 50 MB o menos (tope de Supabase Storage). Los
// videos de cámara vienen a ~27 Mbps: recomprimirlos a ~6-10 Mbps no se nota
// en Instagram, que igual los recomprime.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const BUCKET = "redes-sociales";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const storage = sb.storage.from(BUCKET);

type Item = { video: string; caption: string; desde: string; reel?: { id?: string }; historia?: { id?: string }; error?: string };

async function leerCola(): Promise<Item[]> {
  const { data, error } = await storage.download("cola.json");
  return error || !data ? [] : JSON.parse(await data.text());
}

const [arg, fecha, hora] = process.argv.slice(2);

if (!arg || arg === "--estado") {
  for (const x of await leerCola()) {
    const estado = x.error
      ? `ERROR ${x.error}`
      : x.historia?.id
        ? "reel e historia publicados"
        : x.reel?.id
          ? "reel publicado, falta historia"
          : "pendiente";
    console.log(`${x.desde}  ${x.video}  ${estado}`);
  }
} else {
  if (!fecha || !hora) throw new Error("Falta fecha y hora: tanda.json 2026-11-11 12:30");
  const tanda: { archivo: string; caption: string }[] = JSON.parse(readFileSync(arg, "utf8"));
  for (const t of tanda) {
    const mb = statSync(t.archivo).size / 1024 / 1024;
    if (mb > 50) throw new Error(`${t.archivo} pesa ${mb.toFixed(0)} MB: recomprimir bajo 50 MB`);
  }
  const nuevos: Item[] = [];
  // Hora de Chile con el offset vigente ese día (-03 en verano, -04 en invierno).
  const offset = (d: string) =>
    new Intl.DateTimeFormat("en", { timeZone: "America/Santiago", timeZoneName: "longOffset" })
      .formatToParts(new Date(`${d}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")!
      .value.replace("GMT", "");
  for (const [i, t] of tanda.entries()) {
    const dia = new Date(`${fecha}T12:00:00Z`);
    dia.setUTCDate(dia.getUTCDate() + i);
    const d = dia.toISOString().slice(0, 10);
    const ruta = `videos/${Date.now()}-${basename(t.archivo)}`;
    const { error } = await storage.upload(ruta, readFileSync(t.archivo), { contentType: "video/mp4" });
    if (error) throw new Error(`No se pudo subir ${t.archivo}: ${error.message}`);
    const desde = new Date(`${d}T${hora}:00${offset(d)}`).toISOString();
    nuevos.push({ video: ruta, caption: t.caption, desde });
    console.log(`${d} ${hora}  ${ruta}`);
  }
  // Se lee recién ahora, después de las subidas: el cron la reescribe cada 15
  // minutos y leerla antes pisaría su avance (duplicando publicaciones).
  const cola = [...(await leerCola()), ...nuevos];
  const { error } = await storage.upload("cola.json", JSON.stringify(cola, null, 2), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`No se pudo guardar la cola: ${error.message}`);
  console.log(`Cola: ${cola.length} videos.`);
}
