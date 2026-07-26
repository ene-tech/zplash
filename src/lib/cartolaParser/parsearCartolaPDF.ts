import type { PdfTextItem } from "./columnas";
import { extraerResumenSaldos, reconstruirDetalleMovimientos, type CartolaResumen, type ParsedMovimiento } from "./reconstruirMovimientos";

export interface CartolaParseResult {
  movimientos: ParsedMovimiento[];
  resumen: CartolaResumen;
  warnings: string[];
}

/** Orquestación pura a partir de items ya posicionados (una lista de páginas, cada una una lista de PdfTextItem) — testeable sin pdfjs-dist. */
export function parsearPaginasCartola(paginas: PdfTextItem[][]): CartolaParseResult {
  const { movimientos, warnings } = reconstruirDetalleMovimientos(paginas);
  const textoPagina1 = (paginas[0] ?? []).map((i) => i.text).join(" ");
  const resumen = extraerResumenSaldos(textoPagina1);

  const sumaCargos = movimientos.reduce((s, m) => s + m.cargo, 0);
  const sumaAbonos = movimientos.reduce((s, m) => s + m.abono, 0);
  const cargosDeclarados = (resumen.cheques ?? 0) + (resumen.otrosCargos ?? 0);
  const abonosDeclarados = (resumen.depositos ?? 0) + (resumen.otrosAbonos ?? 0);

  if (cargosDeclarados && Math.abs(sumaCargos - cargosDeclarados) > 1) {
    warnings.push(`El total de cargos parseado ($${sumaCargos.toLocaleString("es-CL")}) no calza con el declarado por el banco ($${cargosDeclarados.toLocaleString("es-CL")}).`);
  }
  if (abonosDeclarados && Math.abs(sumaAbonos - abonosDeclarados) > 1) {
    warnings.push(`El total de abonos parseado ($${sumaAbonos.toLocaleString("es-CL")}) no calza con el declarado por el banco ($${abonosDeclarados.toLocaleString("es-CL")}).`);
  }
  if (!movimientos.length) {
    warnings.push("No se reconoció ningún movimiento — revisa que el PDF sea una cartola de Santander Office Banking.");
  }

  return { movimientos, resumen, warnings };
}

/** Extrae texto posicionado de un PDF de cartola Santander y lo reconstruye en movimientos. Corre solo server-side (dynamic import de pdfjs-dist, que en Node usa un worker en el mismo proceso — ver pdfjs-dist/legacy/build/pdf.mjs, `isNodeJS` deshabilita el Worker real). */
export async function parsearCartolaPDF(bytes: Uint8Array): Promise<CartolaParseResult> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Bajo Turbopack/webpack, el import dinámico de pdfjs-dist queda empaquetado
  // en .next/dev/server/chunks/..., y el default de workerSrc ("./pdf.worker.mjs",
  // relativo a ESE chunk) deja de existir ahí — pdfjs no tiene Worker real en
  // Node (ver isNodeJS más arriba), pero igual hace `import(workerSrc)` para
  // cargar su "fake worker". Se sobreescribe SIEMPRE (no solo si falta): el
  // propio módulo ya deja workerSrc con ese default relativo (truthy) apenas
  // se importa, en un static initializer de PDFWorker — un `if (!workerSrc)`
  // nunca se cumple. Apuntamos a la ruta real en node_modules vía file://
  // URL absoluta, que no depende de dónde Turbopack reubicó el chunk.
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
  ).href;
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  const paginas: PdfTextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({ text: item.str, x: item.transform[4], y: item.transform[5] });
    }
    paginas.push(items);
    await page.cleanup();
  }
  await loadingTask.destroy();
  return parsearPaginasCartola(paginas);
}
