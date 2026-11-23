import type { Metadata, Viewport } from "next";
import TemaOscuroAdmin from "@/components/TemaOscuroAdmin";

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

// Barra del navegador/PWA del color del panel oscuro (el sitio público es claro).
export const viewport: Viewport = {
  themeColor: "#262320",
};

// Saca "tema-claro" de <html> antes del primer pintado, sin esperar a que
// hidrate React (si no, el panel parpadea en claro al abrir). Ver TemaOscuroAdmin.
const SIN_TEMA_CLARO = 'document.documentElement.classList.remove("tema-claro")';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIN_TEMA_CLARO }} />
      <TemaOscuroAdmin />
      {children}
    </>
  );
}
