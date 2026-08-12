import type { Metadata } from "next";

// Checkout (Webpay/Oneclick) y su página de resultado: transaccional, sin
// valor de búsqueda. noindex acá es la segunda capa además del Disallow en
// app/robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PagarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
