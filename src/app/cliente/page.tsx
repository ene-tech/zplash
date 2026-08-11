import Image from "next/image";
import Link from "next/link";
import MiCuentaTab from "@/components/cliente/MiCuentaTab";
import CarritoBadge from "@/components/cliente/CarritoBadge";

// Antes esta página era una segunda "home" pública con pestañas (Ubicación,
// Lavados, Detailing, Empresa, FAQ) que duplicaba el contenido de / y había
// que mantener dos veces. Esas secciones ya viven solo en / (y Detailing se
// sumó ahí); /cliente quedó reducida a lo único que de verdad requiere una
// sesión: la cuenta del cliente. Ya no hay datos vivos que traer server-side
// (MiCuentaTab pide todo por su cuenta), así que no necesita force-dynamic.
export default function ClientePage() {
  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
          </Link>
          <span className="mode">Mi Cuenta</span>
        </div>
        <CarritoBadge />
      </div>

      <div className="content">
        <Link href="/" className="landing-back">
          ← Volver al inicio
        </Link>
        <MiCuentaTab />
      </div>
    </div>
  );
}
