"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Archivo_Black } from "next/font/google";
import { Menu, X, User } from "lucide-react";
import CarritoBadge from "@/components/cliente/CarritoBadge";

// Segunda prueba: Anton (tan condensada que a 16px las letras se pegaban y
// se hacían ilegibles) se cambió por Archivo Black — mismo peso pesado
// tipo "PLASH", pero de ancho normal en vez de condensada, así las letras
// no se aprietan entre sí. Self-hosteada por next/font/google. Solo queda
// en el botón "Mi cuenta" (CTA de marca); los enlaces del menú (desktop y
// mobile) usan la misma fuente que los section-title (--font-outfit, ver
// globals.css) para que el menú calce con los títulos de la landing.
const navFont = Archivo_Black({ weight: "400", subsets: ["latin"] });

// Secciones de la landing en orden de aparición — ids calzan con los
// wrappers .anchor-section en app/page.tsx.
const SECCIONES = [
  { href: "#lavados", label: "Lavados" },
  { href: "#detailing", label: "Detailing" },
  { href: "#faq", label: "Preguntas Frecuentes" },
  { href: "#ubicacion", label: "Ubicación" },
];

// Header con navegación a las secciones de la landing (antes era solo el
// logo + botones). Adaptado de un template de Tailwind Plus: se descartó
// @tailwindplus/elements (paquete pago, no instalado) y el dropdown de
// perfil — en su lugar, interactividad nativa con useState y los botones
// de cuenta quedan siempre visibles (mejor conversión que esconderlos en
// un menú) en vez de replicar el patrón dashboard original.
export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Cerrar menú" : "Abrir menú"}</span>
          {open ? <X /> : <Menu />}
        </button>

        <Link href="/" className="site-nav-logo" aria-label="Ir al inicio" onClick={() => setOpen(false)}>
          <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" priority />
        </Link>

        <div className="site-nav-links">
          {SECCIONES.map((s) => (
            <a key={s.href} href={s.href} className="site-nav-link">
              {s.label}
            </a>
          ))}
        </div>

        <div className="site-nav-actions">
          <CarritoBadge />
          <Link href="/cliente" className="site-nav-account-link" aria-label="Mi cuenta" onClick={() => setOpen(false)}>
            <User />
          </Link>
          <Link href="/cliente" className={`btn secondary btn-mi-cuenta site-nav-btn ${navFont.className}`}>
            Mi cuenta
          </Link>
        </div>
      </div>

      {open && (
        <div className="site-nav-mobile" id="site-nav-mobile">
          {SECCIONES.map((s) => (
            <a key={s.href} href={s.href} className="site-nav-mobile-link" onClick={() => setOpen(false)}>
              {s.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
