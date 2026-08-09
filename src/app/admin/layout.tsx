import type { Metadata } from "next";

// El layout raíz ahora lleva metadata pública (landing en "/"); acá
// recuperamos el título/descripción que tenía el panel cuando vivía en "/".
export const metadata: Metadata = {
  title: "ZPlash · Control de Acceso",
  description: "Sistema de control de acceso y planes de ZPlash",
  appleWebApp: {
    title: "ZPlash",
    statusBarStyle: "black-translucent",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
