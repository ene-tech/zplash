import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "ZPlash · Lavado de autos",
  description: "Lavado de autos sin rallas, planes mensuales ilimitados y servicios de detailing en ZPlash.",
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
