import type { MetadataRoute } from "next";

// /admin, /api, /cliente, /pagar y /carrito son rutas privadas o
// transaccionales sin valor de búsqueda — Disallow acá evita que se
// rastreen; el metadata robots:false en cada layout (ver
// app/{cliente,pagar,carrito}/layout.tsx y app/admin/layout.tsx) es la
// segunda capa por si alguna igual se descubre vía link externo.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/cliente", "/pagar", "/carrito"],
    },
    sitemap: "https://zplash.cl/sitemap.xml",
  };
}
