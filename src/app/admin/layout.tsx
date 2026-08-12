import type { Metadata } from "next";

// El layout raíz ahora lleva metadata pública (landing en "/"); acá
// recuperamos el título/descripción que tenía el panel cuando vivía en "/".
// robots:false porque es el panel operativo, no una página de contenido —
// segunda capa además del Disallow en app/robots.ts.
export const metadata: Metadata = {
  title: "ZPlash · Control de Acceso",
  description: "Sistema de control de acceso y planes de ZPlash",
  robots: { index: false, follow: false },
  appleWebApp: {
    title: "ZPlash",
    statusBarStyle: "black-translucent",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
