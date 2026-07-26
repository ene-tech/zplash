import { agruparFilas, construirRangos, detectarEncabezado, textoPorColumna, type PdfTextItem, type RangoColumna } from "./columnas";
import { esFechaCompleta, fechaCartolaAISO, parseMontoCLP } from "./montos";

export interface ParsedMovimiento {
  fecha: string; // ISO
  glosa: string;
  cargo: number;
  abono: number;
  saldo?: number;
  numeroDocumento?: string;
  sucursal?: string;
}

export interface CartolaResumen {
  saldoInicial?: number;
  saldoFinal?: number;
  depositos?: number;
  otrosAbonos?: number;
  cheques?: number;
  otrosCargos?: number;
}

const MARCA_FIN_DETALLE = /Resumen comisiones|Saldos diarios/i;
const MARCA_IGNORAR = /^Nota:|Inf[oó]rmese|garant[ií]a estatal|^office\s*banking$|^Santander$/i;

interface MovimientoEnConstruccion {
  fecha: string;
  cargo: number;
  abono: number;
  glosaPartes: string[];
  saldo?: number;
  numeroDocumento?: string;
  sucursal?: string;
}

/** Reconstruye los movimientos de la sección "Detalle movimientos", cortando antes de "Resumen comisiones"/"Saldos diarios" (son vistas derivadas del mismo detalle, no movimientos nuevos). */
export function reconstruirDetalleMovimientos(paginas: PdfTextItem[][]): { movimientos: ParsedMovimiento[]; warnings: string[] } {
  const movimientos: ParsedMovimiento[] = [];
  const warnings: string[] = [];
  let rangos: RangoColumna[] | null = null;
  let actual: MovimientoEnConstruccion | null = null;
  let detenido = false;

  const cerrarActual = () => {
    if (!actual) return;
    if (actual.saldo === undefined) {
      warnings.push(
        `Movimiento del ${actual.fecha.slice(0, 10)} ("${actual.glosaPartes.join(" ")}") quedó sin saldo/N°doc/sucursal — revisar manualmente.`
      );
    }
    movimientos.push({
      fecha: actual.fecha,
      glosa: actual.glosaPartes.join(" ").replace(/\s+/g, " ").trim(),
      cargo: actual.cargo,
      abono: actual.abono,
      saldo: actual.saldo,
      numeroDocumento: actual.numeroDocumento,
      sucursal: actual.sucursal,
    });
    actual = null;
  };

  for (const pagina of paginas) {
    if (detenido) break;
    for (const fila of agruparFilas(pagina)) {
      if (detenido) break;
      const textoFila = fila.map((i) => i.text).join(" ").trim();
      if (MARCA_FIN_DETALLE.test(textoFila)) {
        detenido = true;
        break;
      }
      if (MARCA_IGNORAR.test(textoFila)) continue;

      const posibleEncabezado = detectarEncabezado(fila);
      if (posibleEncabezado) {
        rangos = construirRangos(posibleEncabezado);
        continue;
      }
      if (!rangos) continue; // aún no llegamos a la tabla "Detalle movimientos"

      const cols = textoPorColumna(fila, rangos);
      const fechaTxt = (cols.fecha || "").trim();

      if (esFechaCompleta(fechaTxt)) {
        cerrarActual();
        actual = {
          fecha: fechaCartolaAISO(fechaTxt),
          cargo: parseMontoCLP(cols.cargo),
          abono: parseMontoCLP(cols.abono),
          glosaPartes: cols.descripcion ? [cols.descripcion] : [],
          saldo: cols.saldo ? parseMontoCLP(cols.saldo) : undefined,
          numeroDocumento: cols.numeroDocumento || undefined,
          sucursal: cols.sucursal || undefined,
        };
      } else if (actual) {
        if (cols.descripcion) actual.glosaPartes.push(cols.descripcion);
        if (actual.saldo === undefined && cols.saldo) actual.saldo = parseMontoCLP(cols.saldo);
        if (!actual.numeroDocumento && cols.numeroDocumento) actual.numeroDocumento = cols.numeroDocumento;
        if (!actual.sucursal && cols.sucursal) actual.sucursal = cols.sucursal;
      }
    }
  }
  cerrarActual();
  return { movimientos, warnings };
}

/** Extrae el bloque "Saldos" de la página 1 (Saldo inicial/Depósitos/Otros abonos/Cheques/Otros cargos/Saldo final) para usarlo como checksum del parseo — no necesita posición, son pares "Etiqueta: $ monto" en orden de lectura. */
export function extraerResumenSaldos(textoPagina1: string): CartolaResumen {
  const buscar = (etiqueta: string): number | undefined => {
    const m = textoPagina1.match(new RegExp(etiqueta + "\\s*:\\s*\\$?\\s*(-?[\\d.]+)", "i"));
    return m ? parseMontoCLP(m[1]) : undefined;
  };
  return {
    saldoInicial: buscar("Saldo inicial"),
    depositos: buscar("Dep[oó]sitos"),
    otrosAbonos: buscar("Otros abonos"),
    cheques: buscar("Cheques"),
    otrosCargos: buscar("Otros cargos"),
    saldoFinal: buscar("Saldo final"),
  };
}
