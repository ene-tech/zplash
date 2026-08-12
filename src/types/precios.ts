export type Precios = Record<string, { normal: number; promo: number }>;

/** Tamaños de vehículo usados para precios diferenciados de servicios de
 * detailing (ver PreciosTamano) — S/M/L/XL, en este orden fijo para pintar
 * el selector y las columnas de precio siempre igual. */
export const TAMANOS_VEHICULO = ["s", "m", "l", "xl"] as const;
export type TamanoVehiculo = (typeof TAMANOS_VEHICULO)[number];

export const TAMANO_LABEL: Record<TamanoVehiculo, string> = { s: "S", m: "M", l: "L", xl: "XL" };

/** Descripción corta de qué autos caen en cada tamaño — se muestra bajo la
 * letra en el selector para que el cliente (o el operador en el local)
 * elija sin ambigüedad. El texto va en minúscula/mayúscula normal acá (dato
 * reutilizable en contextos donde no corresponde forzar mayúscula, como el
 * banner de tamaño ya elegido); quien necesite verlo en mayúscula sostenida
 * lo hace con text-transform en CSS, no cambiando este string. */
export const TAMANO_DESCRIPCION: Record<TamanoVehiculo, string> = {
  s: "Auto pequeño / Hatchback / City car",
  m: "Sedán mediano / Familiar compacto",
  l: "SUV mediana / Pick-up cabina simple o doble",
  xl: "Pick-up grande, van o furgón / SUV de 3 filas de asientos",
};

/** Ejemplos de modelos comunes en Chile para cada tamaño — ayudan al cliente
 * a ubicarse sin tener que adivinar en qué categoría cae su auto (se probó
 * también con una ilustración por tamaño, pero se sacó: ver
 * scripts/recortar-tamanos-vehiculo.js si se retoma esa idea). Se muestran
 * en el selector de tamaño de DetailingTab. */
export const TAMANO_EJEMPLOS: Record<TamanoVehiculo, string> = {
  s: "Suzuki Alto, Chevrolet Aveo, Kia Picanto, Hyundai Atos, Chery QQ",
  m: "Nissan Tiida, Renault Express, Toyota Corolla, Chevrolet Sail, Hyundai Accent",
  l: "Toyota Hilux, Toyota RAV4, Ford Ranger, Chevrolet S10, Nissan X-Trail, Mazda CX-5",
  xl: "Ford F-150, Chevrolet Silverado, Toyota Hiace, Hyundai H1, furgones y autos de 3 filas de asientos",
};

/** Precio por tamaño de vehículo, keyed por Servicio.id — separado de
 * `Precios` (un solo precio flat) porque un servicio de detailing necesita 4
 * precios distintos según el tamaño del auto. Si un servicio no tiene fila
 * acá, ver precioServicioTamano en lib/helpers/precios.ts para el fallback
 * al precio flat de `Precios`. */
export type PreciosTamano = Record<string, Record<TamanoVehiculo, number>>;
