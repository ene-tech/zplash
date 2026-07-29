import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "ZPlash · Control de Acceso",
  description: "Sistema de control de acceso y planes de ZPlash",
  appleWebApp: {
    title: "ZPlash",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#2d2926",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
