// Parser de la cartola histórica de Cta.Cte de Santander Office Banking
// (PDF). A diferencia de un CSV/Excel, este PDF no trae columnas
// delimitadas: cada celda es texto posicionado por (x, y), y la glosa suele
// partirse en 2 líneas físicas dentro de una misma fila lógica (ver muestra
// real usada para diseñar esto). Por eso no basta con leer el texto en orden
// de lectura — hay que reconstruir a qué columna pertenece cada fragmento
// según su posición x relativa al encabezado de esa página.

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

export type ColumnaId = "fecha" | "cargo" | "abono" | "descripcion" | "saldo" | "numeroDocumento" | "sucursal";

export interface RangoColumna {
  id: ColumnaId;
  x: number;
}

/** Quita tildes y puntuación para poder comparar encabezados sin depender de la codificación exacta del PDF (ej. "DESCRIPCIÓN" vs "DESCRIPCION"). */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

const HEADER_MAP: Record<string, ColumnaId> = {
  FECHA: "fecha",
  CARGO: "cargo",
  ABONO: "abono",
  DESCRIPCION: "descripcion",
  SALDO: "saldo",
  N: "numeroDocumento",
  DOC: "numeroDocumento",
  NDOC: "numeroDocumento",
  SUCURSAL: "sucursal",
};

/** Agrupa items en filas físicas por cercanía de y (arriba->abajo), y dentro de cada fila ordena por x (izquierda->derecha). */
export function agruparFilas(items: PdfTextItem[], tolerancia = 2.5): PdfTextItem[][] {
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const filas: PdfTextItem[][] = [];
  for (const item of ordenados) {
    const filaActual = filas[filas.length - 1];
    if (filaActual && Math.abs(filaActual[0].y - item.y) <= tolerancia) {
      filaActual.push(item);
    } else {
      filas.push([item]);
    }
  }
  for (const fila of filas) fila.sort((a, b) => a.x - b.x);
  return filas;
}

export function detectarEncabezado(fila: PdfTextItem[]): Partial<Record<ColumnaId, number>> | null {
  const inicios: Partial<Record<ColumnaId, number>> = {};
  for (const item of fila) {
    const col = HEADER_MAP[normalizar(item.text)];
    if (col && inicios[col] === undefined) inicios[col] = item.x;
  }
  if (inicios.fecha !== undefined && inicios.descripcion !== undefined && inicios.saldo !== undefined) {
    return inicios;
  }
  return null;
}

export function construirRangos(inicios: Partial<Record<ColumnaId, number>>): RangoColumna[] {
  return (Object.entries(inicios) as [ColumnaId, number][]).sort((a, b) => a[1] - b[1]).map(([id, x]) => ({ id, x }));
}

// Por vecino más cercano, no por umbral de inicio: los montos (Cargo/Abono/
// Saldo) vienen right-aligned dentro de su columna, así que su x real suele
// caer antes del x del propio header — un umbral de "empieza en o después
// del header" los hace caer en la columna anterior (bug real, encontrado
// probando contra un PDF generado a mano: un cargo corto quedaba pegado a la
// columna FECHA y rompía la detección de fila nueva). La distancia al header
// más cercano es simétrica y tolera ese corrimiento en ambos sentidos.
function columnaDeX(rangos: RangoColumna[], x: number): ColumnaId {
  let mejor = rangos[0];
  let mejorDistancia = Math.abs(x - mejor.x);
  for (const r of rangos) {
    const distancia = Math.abs(x - r.x);
    if (distancia < mejorDistancia) {
      mejor = r;
      mejorDistancia = distancia;
    }
  }
  return mejor.id;
}

export function textoPorColumna(fila: PdfTextItem[], rangos: RangoColumna[]): Partial<Record<ColumnaId, string>> {
  const acc: Partial<Record<ColumnaId, string[]>> = {};
  for (const item of fila) {
    const col = columnaDeX(rangos, item.x);
    (acc[col] ??= []).push(item.text);
  }
  const out: Partial<Record<ColumnaId, string>> = {};
  for (const [id, partes] of Object.entries(acc) as [ColumnaId, string[]][]) {
    out[id] = partes.join(" ").replace(/\s+/g, " ").trim();
  }
  return out;
}
