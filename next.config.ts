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
  form-action 'self' https://webpay3g.transbank.cl https://webpay3gint.transbank.cl;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
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
