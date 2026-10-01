import type { MetadataRoute } from "next";
import { SERVICIO_CONTENIDO } from "@/lib/servicioContenido";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

const BASE_URL = "https://zplash.cl";

// Solo páginas públicas con contenido propio — /admin, /cliente, /pagar y
// /carrito quedan fuera (ver robots.ts, y el metadata robots:false de cada
// una). Los ids de /servicios/[id] salen de SERVICIO_CONTENIDO en vez del
// catálogo completo de la base de datos: son los que tienen descripción
// editorial propia, no el texto genérico de CONTENIDO_DEFAULT — listar esos
// últimos sería mandarle a Google páginas casi idénticas entre sí. Solo los
// activos: uno desactivado responde "No encontramos".
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const activos = new Set((await getPreciosPublicos()).servicios.map((s) => s.id));
  const rutasFijas = ["/", "/politicas", "/servicios/full-tunnel", "/servicios/plan-mensual", "/servicios/zona-aspirado"];
  const rutasServicio = Object.keys(SERVICIO_CONTENIDO)
    .filter((id) => activos.has(id))
    .map((id) => `/servicios/${id}`);

  return [...rutasFijas, ...rutasServicio].map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
