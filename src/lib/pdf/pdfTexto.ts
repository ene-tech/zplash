// PDF mínimo de una página, solo texto (Helvetica, A4), escrito a mano para
// no sumar una dependencia: alcanza para comprobantes como el de devolución
// (ver pdfComprobanteReembolso). Codificación WinAnsi: tildes, ñ, ° y — salen
// bien; un carácter fuera de WinAnsi se cambia por "?".

export interface LineaPdf {
  texto: string;
  /** Puntos; por defecto 10. */
  tamano?: number;
  negrita?: boolean;
  /** Gris (0 = negro, 1 = blanco); por defecto 0.15. */
  gris?: number;
  /** Espacio extra antes de la línea, en puntos. */
  antes?: number;
  /** Columna para pares "etiqueta: valor": el valor arranca en esta x. */
  valor?: string;
}

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 56;
const X_VALOR = 220;

// WinAnsi fuera de Latin-1 (los que pueden aparecer en textos de la app).
const WIN_ANSI_EXTRA: Record<string, number> = { "—": 0x97, "–": 0x96, "…": 0x85, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "•": 0x95, "€": 0x80 };

function bytesWinAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (WIN_ANSI_EXTRA[ch] !== undefined) out.push(WIN_ANSI_EXTRA[ch]);
    else if (cp >= 0x20 && cp <= 0xff && !(cp >= 0x7f && cp < 0xa0)) out.push(cp);
    else out.push(0x3f);
  }
  return out;
}

/** String literal de PDF: ( ) y \ escapados, bytes no ASCII en octal. */
function literal(s: string): string {
  return (
    "(" +
    bytesWinAnsi(s)
      .map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? "\\" + String.fromCharCode(b) : b < 0x80 ? String.fromCharCode(b) : "\\" + b.toString(8).padStart(3, "0")))
      .join("") +
    ")"
  );
}

/** Corte por palabras con un ancho conservador de Helvetica (0,62 em: cubre
 * textos en mayúsculas, que es como vienen muchos nombres); una palabra más
 * larga que la línea (URL, correo) se parte a la fuerza. */
function partir(texto: string, tamano: number, ancho: number): string[] {
  const max = Math.max(10, Math.floor(ancho / (tamano * 0.62)));
  const palabras = texto.split(/\s+/).flatMap((p) => (p.length <= max ? [p] : p.match(new RegExp(`.{1,${max}}`, "g"))!));
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    if (!actual) actual = palabra;
    else if ((actual + " " + palabra).length <= max) actual += " " + palabra;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

/** Una sola página: lo que no cabe se corta con "…" en vez de salirse de la
 * hoja sin aviso (los textos libres que llegan acá vienen acotados). */
export function pdfTexto(lineas: LineaPdf[], titulo = "Documento"): Buffer {
  const ops: string[] = [];
  let y = ALTO - MARGEN;
  const PISO = MARGEN;
  for (const l of lineas) {
    if (y - (l.antes ?? 0) - (l.tamano ?? 10) * 1.5 < PISO) {
      ops.push(`BT /F1 10 Tf 0.5 g ${MARGEN} ${PISO.toFixed(2)} Td ${literal("…")} Tj ET`);
      break;
    }
    const tamano = l.tamano ?? 10;
    const gris = l.gris ?? 0.15;
    const fuente = l.negrita ? "/F2" : "/F1";
    y -= l.antes ?? 0;
    if (l.valor !== undefined) {
      const valores = partir(l.valor, tamano, ANCHO - MARGEN - X_VALOR);
      y -= tamano * 1.5;
      ops.push(`BT /F1 ${tamano} Tf 0.5 g ${MARGEN} ${y.toFixed(2)} Td ${literal(l.texto)} Tj ET`);
      for (const [i, v] of valores.entries()) {
        if (i > 0) y -= tamano * 1.4;
        if (y < PISO) break;
        ops.push(`BT ${fuente} ${tamano} Tf ${gris} g ${X_VALOR} ${y.toFixed(2)} Td ${literal(v)} Tj ET`);
      }
      continue;
    }
    for (const parte of partir(l.texto, tamano, ANCHO - 2 * MARGEN)) {
      y -= tamano * 1.4;
      if (y < PISO) break;
      ops.push(`BT ${fuente} ${tamano} Tf ${gris} g ${MARGEN} ${y.toFixed(2)} Td ${literal(parte)} Tj ET`);
    }
  }

  const contenido = ops.join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    `<< /Title ${literal(titulo)} /Producer (ZPlash) >>`,
  ];

  // Todo es ASCII (los bytes altos van en octal), así que largo = bytes.
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${objetos.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
