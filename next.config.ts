import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Sin nonces a propósito: forzaría renderizado dinámico en todo el sitio
// (incluidas las páginas públicas /servicios, /cliente, etc.) solo para
// bloquear inline scripts que hoy no representan un vector de XSS conocido
// (no hay dangerouslySetInnerHTML ni eval en el código propio). Ver "Without
// Nonces" en node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.supabase.co;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  form-action 'self' https://webpay3g.transbank.cl https://webpay3gint.transbank.cl;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim();

// zplash.cl vivió años en WordPress + WooCommerce antes de esta app; estas
// son las 32 URLs que ese sitio tiene indexadas en Google hoy (reconstruidas
// desde su sitemap_index.xml de Yoast el 2026-08-12, no adivinadas). Cortar
// el dominio sin esto convierte cada resultado de búsqueda y cada link viejo
// en un 404 — cuando la app tome zplash.cl, este bloque tiene que estar
// desplegado primero. No borrar filas después del corte: no cuestan nada y
// siguen protegiendo backlinks/clics años después.
const REDIRECTS_LEGACY_WORDPRESS: { source: string; destination: string }[] = [
  // Páginas
  { source: "/carrito/", destination: "/carrito" },
  { source: "/mi-cuenta/", destination: "/cliente" },
  { source: "/finalizar-compra/", destination: "/pagar" },
  { source: "/planes/", destination: "/servicios/plan-mensual" },
  { source: "/tipos-de-laavdo/", destination: "/#lavados" }, // typo del slug original, pero está indexado y recibe clics igual
  { source: "/lavado-pro/", destination: "/servicios/full-tunnel" },
  { source: "/empresas/", destination: "/#venta-empresa" },
  { source: "/registrate/", destination: "/cliente" },
  { source: "/landing/", destination: "/" },
  { source: "/about/", destination: "/" }, // página demo del tema, sin contenido propio
  { source: "/portfolio/", destination: "/" }, // idem
  { source: "/sample-page/", destination: "/" }, // página por defecto de WordPress

  // Productos WooCommerce (/producto/:slug/)
  { source: "/producto/lavado-exterior-full-tunel/", destination: "/servicios/full-tunnel" },
  { source: "/producto/lavado-completo/", destination: "/servicios/full-tunnel" },
  { source: "/producto/suscripcion-lavado-1-mes/", destination: "/servicios/plan-mensual" },
  { source: "/producto/plan-lavado-mensual-promocion/", destination: "/servicios/plan-mensual" }, // el bot de WhatsApp linkeaba directo acá — ver lib/helpers/whatsapp.ts
  { source: "/producto/lavado-de-tapiz/", destination: "/servicios/tapiz" },
  { source: "/producto/promo-lavado/", destination: "/#lavados" },
  // Los packs de 10/20/30/40 tickets siguen vigentes — hoy viven como "Packs
  // de tickets para tu flota" en Venta a Empresa (ver PACKS_EMPRESA en
  // lib/helpers/precios.ts, mismas 4 cantidades), no como producto suelto.
  { source: "/producto/10-tickets-de-lavado/", destination: "/#venta-empresa" },
  { source: "/producto/20-tickets-de-lavado/", destination: "/#venta-empresa" },
  { source: "/producto/30-tickets-de-lavado/", destination: "/#venta-empresa" },
  { source: "/producto/40-tickets-de-lavado/", destination: "/#venta-empresa" },

  // Taxonomías y archivos automáticos de WordPress/WooCommerce
  { source: "/categoria-producto/planes/", destination: "/servicios/plan-mensual" },
  { source: "/categoria-producto/membresia/", destination: "/#lavados" },
  { source: "/categoria-producto/ticket-empresas/", destination: "/#venta-empresa" },
  { source: "/etiqueta-producto/1-mes/", destination: "/servicios/plan-mensual" },
  { source: "/categoria-producto/sin-categorizar/", destination: "/" },
  { source: "/category/uncategorized/", destination: "/" },
  { source: "/etiqueta-producto/promo6/", destination: "/" },
  { source: "/author/zplash/", destination: "/" },

  // Entradas de blog
  { source: "/donde-lavar-mi-auto-en-temuco-la-mejor-opcion-es-zplash-car-wash/", destination: "/" },
  { source: "/hello-world/", destination: "/" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return REDIRECTS_LEGACY_WORDPRESS.map((r) => ({ ...r, permanent: true }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
