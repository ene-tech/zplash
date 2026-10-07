import Image from "next/image";
import Link from "next/link";
import CarritoBadge from "@/components/cliente/CarritoBadge";

// Header compartido de todas las páginas de cliente fuera de la landing
// (/cliente, /servicios/*, /cliente/detailing) — antes cada página repetía
// este bloque a mano y dos de ellas (servicios/[id], cliente/detailing) se
// habían quedado sin el ícono del carrito por el copy-paste. Misma clase
// que usa SiteNav (.btn-mi-cuenta: botón de texto en desktop y mobile,
// compactado bajo 900px) para que el header sea idéntico en toda la app.
// Queda fijo arriba al hacer scroll (.cliente-header es sticky); con
// volverHref lleva la flecha de volver adentro, así no hay que subir para
// salir de una ficha larga.
export default function ClienteHeader({
  titulo,
  ocultarMiCuenta,
  volverHref,
}: {
  titulo: string;
  ocultarMiCuenta?: boolean;
  volverHref?: string;
}) {
  return (
    <div className="cliente-header">
      <div className="title">
        {volverHref && (
          <Link href={volverHref} className="landing-back-icon cliente-header-back" aria-label="Volver">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5 L8 12 L15 19" />
            </svg>
          </Link>
        )}
        <Link href="/" aria-label="Ir al inicio">
          <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" priority />
        </Link>
        <span className="mode">{titulo}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CarritoBadge />
        {!ocultarMiCuenta && (
          <Link href="/cliente" className="btn secondary btn-mi-cuenta" style={{ marginTop: 0, textDecoration: "none" }}>
            Mi cuenta
          </Link>
        )}
      </div>
    </div>
  );
}
