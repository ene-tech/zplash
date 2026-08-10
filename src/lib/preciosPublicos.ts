import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { precios, servicios } from "@/db/schema";
import {
  PACKS_EMPRESA,
  PLANES,
  precioLavadoUnicoWeb,
  precioNormal,
  precioPackEmpresa,
  precioPlanOneclick,
  precioServicio,
  precioZonaAspirado,
  SERVICIOS_DEFAULT,
} from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";

// Fuente única de los precios públicos: la usan tanto Server Components
// (páginas de /cliente, /servicios/*) como /api/pagos/precios (que sigue
// existiendo para los pocos lugares que todavía necesitan pedirlos desde el
// cliente, p.ej. /pagar tras una interacción).
export async function getPreciosPublicos(): Promise<PreciosPublicos> {
  const db = getDb();
  const [filas, filasServicios] = await Promise.all([
    db.select().from(precios),
    db.select().from(servicios).where(eq(servicios.activo, true)),
  ]);
  const preciosMap = Object.fromEntries(filas.map((p) => [p.plan, { normal: p.normal, promo: p.promo }]));
  const catalogo = filasServicios.length ? filasServicios : SERVICIOS_DEFAULT.filter((s) => s.activo);

  return {
    plan: { nombre: PLANES[0], precio: precioNormal(preciosMap, PLANES[0]) },
    planOneclick: { nombre: PLANES[0], precio: precioPlanOneclick(preciosMap) },
    lavadoUnico: { nombre: "Lavado único", precio: precioLavadoUnicoWeb(preciosMap) },
    zonaAspirado: { nombre: "Uso Zona Aspirado Autoservicio", precio: precioZonaAspirado(preciosMap) },
    servicios: catalogo.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      categoria: s.categoria ?? undefined,
      precio: precioServicio(preciosMap, s.id),
    })),
    packsEmpresa: PACKS_EMPRESA.map((p) => ({
      cantidad: p.cantidad,
      nombre: p.key,
      precio: precioPackEmpresa(preciosMap, p.cantidad),
    })),
  };
}
