export type Precios = Record<string, { normal: number; promo: number }>;

/** Tamaños de vehículo usados para precios diferenciados de servicios de
 * detailing (ver PreciosTamano) — S/M/L/XL, en este orden fijo para pintar
 * el selector y las columnas de precio siempre igual. */
export const TAMANOS_VEHICULO = ["s", "m", "l", "xl"] as const;
export type TamanoVehiculo = (typeof TAMANOS_VEHICULO)[number];

export const TAMANO_LABEL: Record<TamanoVehiculo, string> = { s: "S", m: "M", l: "L", xl: "XL" };

/** Descripción corta de qué autos caen en cada tamaño — se muestra bajo la
 * letra en el selector para que el cliente (o el operador en el local)
 * elija sin ambigüedad. */
export const TAMANO_DESCRIPCION: Record<TamanoVehiculo, string> = {
  s: "Auto pequeño / Hatchback",
  m: "Sedán mediano",
  l: "SUV / Pick-up",
  xl: "Van / Camioneta grande",
};

/** Precio por tamaño de vehículo, keyed por Servicio.id — separado de
 * `Precios` (un solo precio flat) porque un servicio de detailing necesita 4
 * precios distintos según el tamaño del auto. Si un servicio no tiene fila
 * acá, ver precioServicioTamano en lib/helpers/precios.ts para el fallback
 * al precio flat de `Precios`. */
export type PreciosTamano = Record<string, Record<TamanoVehiculo, number>>;
