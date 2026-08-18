// Catálogo de "qué se vendió" del Cierre de Caja: una fila por tipo de venta
// conocido. Vive aparte de useCierreData porque ArqueoDia lo reusa para
// etiquetar el tipo de cada venta en la tabla del día.
/** Venta cobrada en caja que no pasaba por el túnel ni por el catálogo de
 * planes/servicios (lavado de moto, de bicicleta, etc.). Ya no se crea desde
 * ninguna pantalla —el arqueo dejó de cargar ventas a mano y eso ahora se
 * cuadra con el asiento de ajuste de ingreso monetario, ver ArqueoDia—, pero
 * el tipo se queda acá para que las ventas históricas sigan sumando en su
 * fila de "Detalle de venta" y no caigan en "Otros". */
export const TIPO_VENTA_PUNTUAL = "Venta puntual";

export const PRODUCTOS_CIERRE = [
  { tipo: "Lavado único", label: "Lavado único" },
  { tipo: "Plan nuevo", label: "Contratación de plan" },
  { tipo: "Renovación preferencial", label: "Renovación temprana" },
  { tipo: "Reactivación promocional", label: "Reactivación promocional (plan vencido)" },
  { tipo: "Renovación atrasada", label: "Renovación atrasada (dentro del plazo de gracia)" },
  { tipo: "Plan nuevo (Web)", label: "Contratación de plan (Web automático)" },
  { tipo: "Renovación (Web)", label: "Renovación de plan (Web automático)" },
  { tipo: "Cupón Venta Empresa", label: "Cupón Venta Empresa" },
  { tipo: TIPO_VENTA_PUNTUAL, label: "Venta puntual (moto, bicicleta, otros)" },
];
