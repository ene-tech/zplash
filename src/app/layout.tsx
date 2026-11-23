import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import AvisoCookies from "@/components/cliente/AvisoCookies";

// Título de sección (.section-title en globals.css): opción E de la
// propuesta de tipografías, más liviana que el peso 800 de Helvetica Neue
// que tenía antes. Se expone como variable CSS en vez de className directo
// porque .section-title se usa en varios componentes distintos.
const outfit = Outfit({ weight: "500", subsets: ["latin"], variable: "--font-outfit" });
// Tipografía del tema "Día Claro" (clase tema-claro en <html>, ver globals.css).
const jakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://zplash.cl"),
  title: "Lavado de autos en Temuco · Túnel y aspirado | ZPlash",
  description:
    "Lavado de autos por túnel en Temuco, sin reserva y abierto todos los días. Aspirado sin límite de tiempo y Plan X5 (5 lavados al mes). Prieto Norte 71.",
  openGraph: { images: ["/tunel/prelavado-portada3.jpg"] },
  appleWebApp: {
    title: "ZPlash",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: el panel (/admin) le saca "tema-claro" a <html>
    // antes de hidratar (ver admin/layout.tsx), y la clase ya no coincide.
    <html lang="es" className={`${outfit.variable} ${jakarta.variable} tema-claro`} suppressHydrationWarning>
      <body>
        {children}
        <Toaster />
        <RegisterServiceWorker />
        <AvisoCookies />
      </body>
    </html>
  );
}
