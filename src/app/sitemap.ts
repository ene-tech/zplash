import type { MetadataRoute } from "next";
import { SERVICIO_CONTENIDO } from "@/lib/servicioContenido";

const BASE_URL = "https://zplash.cl";

// Solo páginas públicas con contenido propio — /admin, /cliente, /pagar y
// /carrito quedan fuera (ver robots.ts, y el metadata robots:false de cada
// una). Los ids de /servicios/[id] salen de SERVICIO_CONTENIDO en vez del
// catálogo completo de la base de datos: son los que tienen descripción
// editorial propia, no el texto genérico de CONTENIDO_DEFAULT — listar esos
// últimos sería mandarle a Google páginas casi idénticas entre sí.
export default function sitemap(): MetadataRoute.Sitemap {
  const rutasFijas = ["/", "/servicios/full-tunnel", "/servicios/plan-mensual", "/servicios/zona-aspirado"];
  const rutasServicio = Object.keys(SERVICIO_CONTENIDO).map((id) => `/servicios/${id}`);

  return [...rutasFijas, ...rutasServicio].map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
