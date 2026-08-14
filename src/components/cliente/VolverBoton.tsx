import Link from "next/link";

// Botón "volver" de las páginas secundarias de la landing (fichas de
// servicio, carrito, resultado de pago, Mi Cuenta): antes cada página
// repetía su propio link de texto "← Volver a...", ahora todas comparten
// este botón con look skeuomórfico (relieve + flecha propia) para que se
// note a simple vista que es un control de navegación y no un link más del
// contenido. No lleva "use client": next/link funciona igual dentro de
// Server Components.
export default function VolverBoton({
  href,
  label,
  style,
}: {
  href: string;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link href={href} className="landing-back" style={style}>
      <span className="landing-back-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5 L8 12 L15 19" />
        </svg>
      </span>
      {label}
    </Link>
  );
}
