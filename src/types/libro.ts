export const TIPOS_LIBRO = ["reclamo", "sugerencia", "felicitacion"] as const;
export type TipoLibro = (typeof TIPOS_LIBRO)[number];

export const TIPO_LIBRO_LABELS: Record<TipoLibro, string> = {
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
  felicitacion: "Felicitación",
};

// Tono del status-pill por tipo, compartido entre LibroView (panel) y
// LibroComentarios (portal) — mismo patrón que ESTADO_PAGO_TONE en
// serviciosLog: un Record al lado de los labels obliga al compilador a cubrir
// un tipo nuevo en los dos lados a la vez.
export const TIPO_LIBRO_TONE: Record<TipoLibro, "ok" | "warn" | "bad"> = {
  reclamo: "bad",
  sugerencia: "warn",
  felicitacion: "ok",
};

/** Tope del mensaje, compartido entre el maxLength del textarea del portal y
 * el 400 del servidor para que no diverjan. Holgado para un reclamo escrito a
 * mano; corta un pegado accidental de media página, no un mensaje real. */
export const LIBRO_MENSAJE_MAX = 2000;

/** Una entrada del libro de reclamos, sugerencias y felicitaciones (ver
 * @/db/schema/libro). `email` es el de la sesión de cliente que la escribió,
 * siempre en minúsculas. */
export interface LibroComentario {
  id: string;
  email: string;
  tipo: TipoLibro;
  mensaje: string;
  creadoEn: string;
}
