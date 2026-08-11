import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import CarritoBadge from "@/components/cliente/CarritoBadge";

// Header compartido de todas las páginas de cliente fuera de la landing
// (/cliente, /servicios/*, /cliente/detailing) — antes cada página repetía
// este bloque a mano y dos de ellas (servicios/[id], cliente/detailing) se
// habían quedado sin el ícono del carrito por el copy-paste. Mismas clases
// que usa SiteNav (.site-nav-account-link, .btn-mi-cuenta) para que el
// comportamiento responsive (ícono redondo en mobile, botón de texto en
// desktop) sea idéntico en toda la app.
export default function ClienteHeader({ titulo, ocultarMiCuenta }: { titulo: string; ocultarMiCuenta?: boolean }) {
  return (
    <div className="cliente-header">
      <div className="title">
        <Link href="/" aria-label="Ir al inicio">
          <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
        </Link>
        <span className="mode">{titulo}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CarritoBadge />
        {!ocultarMiCuenta && (
          <>
            <Link href="/cliente" className="site-nav-account-link" aria-label="Mi cuenta">
              <User />
            </Link>
            <Link href="/cliente" className="btn secondary btn-mi-cuenta" style={{ marginTop: 0, textDecoration: "none" }}>
              Mi cuenta
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
