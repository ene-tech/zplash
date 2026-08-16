import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

// Título de sección (.section-title en globals.css): opción E de la
// propuesta de tipografías, más liviana que el peso 800 de Helvetica Neue
// que tenía antes. Se expone como variable CSS en vez de className directo
// porque .section-title se usa en varios componentes distintos.
const outfit = Outfit({ weight: "500", subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  metadataBase: new URL("https://zplash.cl"),
  title: "ZPlash · Lavado de autos",
  description: "Lavado de autos sin rallas, planes mensuales ilimitados y servicios de detailing en ZPlash.",
  appleWebApp: {
    title: "ZPlash",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#262320",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={outfit.variable}>
      <body>
        {children}
        <Toaster />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
