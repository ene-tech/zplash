import {
  fmtCLP,
  precioServicio,
  PRECIOS_DEFAULT,
  PRECIO_LAVADO_UNICO,
} from "@/lib/helpers";
import type { Precios, Servicio } from "@/types";

export const DESCUENTO_PRIMERA_VEZ_VALOR = 1000;
export const DESCUENTO_PRIMERA_VEZ_DIAS_VALIDEZ = 7;

export const SERVICIOS_IMAGEN_PATH = "/servicios-precios.jpg";

export const PLAN_IMAGEN_PATH = "/plan-mensual.jpg";

export function textoPrecios(precios: Precios, servicios: Servicio[]): string {
  const lineas = [`💰 *Precios*`, ``];

  for (const [plan, precio] of Object.entries(PRECIOS_DEFAULT)) {
    lineas.push(`${plan}: ${fmtCLP(precio.promo)} (normal ${fmtCLP(precio.normal)})`);
  }

  lineas.push(``, `Lavado único: ${fmtCLP(PRECIO_LAVADO_UNICO)}`, ``, `*Servicios adicionales*`);
  for (const s of servicios.filter((s) => s.activo)) {
    lineas.push(`${s.nombre}: ${fmtCLP(precioServicio(precios, s.id))}`);
  }

  return lineas.join("\n");
}
