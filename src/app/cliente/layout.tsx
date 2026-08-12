import type { Metadata } from "next";

// Portal del cliente: rutas detrás de login por patente/OTP, sin equivalente
// de contenido público que mostrarle a Google. noindex acá es la segunda
// capa además del Disallow en app/robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
