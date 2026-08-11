import Image from "next/image";
import Link from "next/link";
import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

const WHATSAPP_URL =
  "https://wa.me/56957969446?text=" + encodeURIComponent("Hola, quiero agendar un Servicio de Detailing para mi auto");

// Ver nota en /cliente/page.tsx: precios siempre frescos desde la base.
export const dynamic = "force-dynamic";

export default async function DetailingLandingPage() {
  const precios = await getPreciosPublicos();
  const servicios = precios.servicios.filter((s) => s.categoria === CATEGORIA_DETAILING);

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
          </Link>
          <span className="mode">Portal Cliente</span>
        </div>
        <Link href="/cliente" className="btn secondary btn-mi-cuenta" style={{ marginTop: 0, textDecoration: "none" }}>
          Mi cuenta
        </Link>
      </div>

      <div className="cliente-hero">
        <h1>Lavado Completo Detailing</h1>
        <p>
          Limpieza completa por dentro y por fuera: carrocería, llantas, interior y detalles. Agenda tu horario y te
          esperamos con tu auto listo.
        </p>
      </div>

      <div className="content" style={{ maxWidth: 640 }}>
        {servicios.length === 0 ? (
          <div className="card">
            <p style={{ color: "var(--gray)", fontSize: 14 }}>
              No hay precios de Detailing publicados por el momento. Escríbenos por WhatsApp y te cotizamos.
            </p>
          </div>
        ) : (
          <div className="service-grid" style={{ marginBottom: 22 }}>
            {servicios.map((s) => (
              <div className="service-btn" key={s.id} style={{ cursor: "default" }}>
                <div className="nombre">{s.nombre}</div>
                <div className="precio">{fmtCLP(s.precio)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <h3>📅 Agenda tu hora</h3>
          <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
            Cuéntanos la patente de tu auto y el horario que prefieres, y te confirmamos disponibilidad.
          </p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
            Agendar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
