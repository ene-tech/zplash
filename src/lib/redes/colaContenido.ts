// Cola de publicaciones orgánicas en Instagram (@zplash.cl): cada video sale
// como reel (también en el feed) y después el mismo video como historia.
// Reemplaza a scripts/publicar-reels.mts, que corría desde la tarea de Windows
// y no publicaba nada con el PC apagado (oct-2026). Ahora todo vive en el
// bucket privado "redes-sociales" de Supabase: los videos en videos/ y la cola
// en cola.json, y el cron /api/redes/publicar da un paso cada 15 minutos.
//
// Un paso = una llamada corta a Meta (crear contenedor, mirar si terminó de
// procesar, o publicar), para no quedar esperando dentro de la función.
// Meta descarga el video desde una URL firmada del bucket (video_url).

export interface FaseCola {
  contenedor?: string;
  creadoEn?: string;
  id?: string;
  intentos: number;
  ultimoError?: string;
}

export interface ItemCola {
  /** Ruta dentro del bucket, ej. "videos/edgar-agosto-3.mp4". */
  video: string;
  caption: string;
  /** ISO: no se publica antes de esta hora. */
  desde: string;
  reel?: FaseCola;
  historia?: FaseCola;
  /** Se rindió después de MAX_INTENTOS: queda fuera de la cola. */
  error?: string;
}

export const MAX_INTENTOS = 3;
/** Un contenedor que sigue IN_PROGRESS pasado esto se da por perdido. */
export const ESPERA_MAXIMA_MS = 60 * 60 * 1000;

export interface MetaContenido {
  crearContenedor(tipo: "REELS" | "STORIES", videoUrl: string, caption?: string): Promise<string>;
  estado(contenedor: string): Promise<{ status_code: string; status?: string }>;
  publicar(contenedor: string): Promise<string>;
}

/** Siguiente item con algo pendiente cuya hora ya llegó, en orden de la cola. */
export function itemPendiente(cola: ItemCola[], ahora: Date): ItemCola | undefined {
  return cola.find((x) => !x.error && !x.historia?.id && new Date(x.desde).getTime() <= ahora.getTime());
}

/**
 * Avanza un paso la cola (la modifica en el lugar) y describe lo que hizo.
 * `guardar` se llama justo después de cada cambio que no se puede repetir
 * (contenedor creado, publicado), para que un fallo posterior no duplique.
 */
export async function avanzarCola(
  cola: ItemCola[],
  ahora: Date,
  meta: MetaContenido,
  urlFirmada: (ruta: string) => Promise<string>,
  guardar: () => Promise<void>
): Promise<string> {
  const item = itemPendiente(cola, ahora);
  if (!item) return "nada pendiente";
  const nombre = item.reel?.id ? "historia" : "reel";
  const fase: FaseCola = (item[nombre] ??= { intentos: 0 });

  // conservarContenedor: el fallo fue al publicar. Meta pudo haberlo publicado
  // igual (timeout), así que se reintenta con el MISMO contenedor, que Meta no
  // publica dos veces; uno nuevo duplicaría el reel.
  const fallar = async (motivo: string, conservarContenedor = false) => {
    fase.intentos++;
    fase.ultimoError = motivo;
    if (!conservarContenedor) {
      delete fase.contenedor;
      delete fase.creadoEn;
    }
    if (fase.intentos >= MAX_INTENTOS) item.error = `${nombre}: ${motivo}`;
    await guardar();
    return `${item.video} ${nombre} falló (intento ${fase.intentos}): ${motivo}`;
  };

  try {
    if (!fase.contenedor) {
      const url = await urlFirmada(item.video);
      fase.contenedor = await meta.crearContenedor(
        nombre === "reel" ? "REELS" : "STORIES",
        url,
        nombre === "reel" ? item.caption : undefined
      );
      fase.creadoEn = ahora.toISOString();
      await guardar();
      return `${item.video} ${nombre}: contenedor ${fase.contenedor} creado`;
    }

    const { status_code, status } = await meta.estado(fase.contenedor);
    if (status_code === "FINISHED") {
      try {
        fase.id = await meta.publicar(fase.contenedor);
      } catch (e) {
        return fallar(`al publicar: ${e instanceof Error ? e.message : String(e)}`, true);
      }
      // Si guardar falla acá, el error sube (500) sin tocar el contenedor: la
      // próxima corrida reintenta publicar el mismo y Meta lo rechaza.
      await guardar();
      return `${item.video} ${nombre} publicado (${fase.id})`;
    }
    if (status_code === "ERROR" || status_code === "EXPIRED") return fallar(`Meta: ${status ?? status_code}`);
    if (ahora.getTime() - new Date(fase.creadoEn ?? ahora).getTime() > ESPERA_MAXIMA_MS) {
      return fallar("sigue procesándose después de 1 hora");
    }
    return `${item.video} ${nombre}: procesando`;
  } catch (e) {
    if (fase.id) throw e; // ya publicado, solo falló guardar: no reintentar
    return fallar(e instanceof Error ? e.message : String(e));
  }
}
