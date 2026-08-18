/** Totales del día tal como se firmaron al cerrar la caja. Se guardan con el
 * cierre en vez de recalcularse: es exactamente lo que la persona que cerró
 * revisó y aprobó, y debe seguir leyéndose igual aunque mañana cambie cómo
 * se agrupan las filas en Cierre de Caja. */
export interface ResumenCierre {
  cantidadIngresos: number;
  cantidadVentas: number;
  totalVentas: number;
  metodosPago: { metodo: string; cantidad: number; monto: number }[];
  /** Lo que la caja debería tener en efectivo según el sistema. */
  efectivoEsperado: number;
  /** Lo que se contó físicamente al arquear (opcional: puede cerrarse sin contar). */
  efectivoContado?: number;
  /** Asiento de ajuste de ingreso a túnel inscrito al cerrar el día:
   * vehículos que pasaron por el túnel y no quedaron registrados (cantidad
   * positiva) o que quedaron registrados de más (negativa), con su motivo.
   * Vive acá y no como filas de `ingresos` porque no hay patente ni cliente
   * detrás — corrige el conteo del día, no registra un paso por el túnel.
   * `cantidadIngresos` sigue siendo lo que alcanzó a registrar el sistema: el
   * conteo real del día es la suma de los dos. */
  ajusteIngresos?: { cantidad: number; motivo: string };
}

/** Un día de caja ya cuadrado, arqueado y cerrado. Una fila por día (`fecha`
 * es la clave primaria) y nunca se actualiza ni se borra: cerrar es
 * irreversible por diseño, y a partir de ahí ninguna venta/ingreso/movimiento
 * de ese día se puede seguir editando desde la app (ver los guards de
 * @/lib/dataAccess/cierre). */
export interface CierreCaja {
  /** Día cerrado, "YYYY-MM-DD" en hora de Chile (ver diaCaja en @/lib/helpers). */
  fecha: string;
  cerradoPor: string;
  cerradoEn: string;
  resumen: ResumenCierre;
  notas?: string;
}
