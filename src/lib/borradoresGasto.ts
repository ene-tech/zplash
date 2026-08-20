import type { MovimientoContable } from "@/types";

/** Asiento de Egresos/Gastos guardado a medias para terminarlo más tarde
 * (botón "Guardar borrador" en MovimientoContableForm). Son los mismos
 * campos del formulario, sin validar ninguno: la gracia del borrador es
 * justamente que le falte información. */
export interface BorradorGasto {
  id: string;
  guardadoEn: string;
  fecha: string;
  descripcion: string;
  categoriaGasto: string;
  contraparte: string;
  rutProveedor: string;
  numeroFactura: string;
  tipoDocumento: "Boleta" | "Factura" | null;
  montoTexto: string;
  estado: MovimientoContable["estado"];
  notas: string;
  // Solo el nombre: el File adjunto no se puede guardar en localStorage, así
  // que al retomar el borrador se avisa cuál documento hay que volver a
  // adjuntar en vez de perderlo en silencio.
  archivoNombre?: string;
}

// Los borradores viven en localStorage y no en `movimientos_contables` a
// propósito: un borrador no es un movimiento contable. Si se guardara en la
// tabla habría que excluirlo a mano de EERR, Cuentas por Pagar, Rendiciones,
// cierre de caja y conciliación, y basta olvidar uno para que los números
// salgan mal. Costo asumido: los borradores son de este navegador.
const STORAGE_KEY = "zplash_borradores_gasto";

export function leerBorradoresGasto(): BorradorGasto[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function escribir(lista: BorradorGasto[]): BorradorGasto[] {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  return lista;
}

/** Upsert por id: volver a guardar el borrador que se está editando lo
 * actualiza en vez de duplicarlo. */
export function guardarBorradorGasto(b: BorradorGasto): BorradorGasto[] {
  return escribir([b, ...leerBorradoresGasto().filter((x) => x.id !== b.id)]);
}

export function eliminarBorradorGasto(id: string): BorradorGasto[] {
  return escribir(leerBorradoresGasto().filter((x) => x.id !== id));
}
