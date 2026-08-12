import type { Metadata } from "next";

// Carrito de compra: transaccional, sin valor de búsqueda. noindex acá es la
// segunda capa además del Disallow en app/robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CarritoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
