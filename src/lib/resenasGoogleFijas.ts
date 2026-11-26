// Comentarios reales de la ficha de Google de Zplash, copiados a mano por el
// dueño (26-nov-2026): la Places API devuelve la nota y el total pero ningún
// comentario para esta ficha. Solo comentarios reales, tal cual están en
// Google; para agregar uno, sumarlo acá con la fecha en que se publicó.

export interface ResenaFija {
  autor: string;
  estrellas: number;
  texto: string;
  /** Fecha de publicación en Google (AAAA-MM-DD), para calcular el "hace…". */
  fecha: string;
}

export const RESENAS_FIJAS: ResenaFija[] = [
  {
    autor: "Pedro Flores",
    estrellas: 5,
    texto:
      "Excelente opción para mantener tu automóvil SIEMPRE LIMPIO a un precio absolutamente alcanzable .....nivel Europeo....cada vez mejor",
    fecha: "2026-11-25",
  },
  // Fechas calculadas desde el "hace…" que mostraba Google el 26-nov-2026
  {
    autor: "Felipe Arias",
    estrellas: 5,
    texto: "Buena atencion, de la señora de los tickets.",
    fecha: "2026-11-20",
  },
  {
    autor: "Franco Ríos",
    estrellas: 5,
    texto: "El mejor lavado, atención 10/10",
    fecha: "2026-11-05",
  },
  {
    autor: "Emporio Organika",
    estrellas: 5,
    texto:
      "Me encantó rápido, el personal muy amable y los productos buenísimos veníamos con la camioneta súper sucia y quedó impecable",
    fecha: "2026-10-29",
  },
  {
    autor: "emlk",
    estrellas: 5,
    texto: "La vd excelente servicio, rápido y todos amables, hoy compré la suscripción mensual, vale totalmente la pena!",
    fecha: "2026-04-30",
  },
];

/** "hace 3 días", "hace 2 semanas"… a partir de la fecha de publicación. */
export function haceCuanto(fecha: string, ahora = new Date()): string {
  const dias = Math.round((ahora.getTime() - new Date(`${fecha}T12:00:00-03:00`).getTime()) / 86_400_000);
  if (dias < 1) return "hoy";
  if (dias === 1) return "hace 1 día";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 30) return dias < 14 ? "hace 1 semana" : `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 365) return dias < 60 ? "hace 1 mes" : `hace ${Math.floor(dias / 30)} meses`;
  return dias < 730 ? "hace 1 año" : `hace ${Math.floor(dias / 365)} años`;
}
