import Image from "next/image";
import Link from "next/link";
import TiposLavadoTab from "@/components/cliente/TiposLavadoTab";
import VentaEmpresaInfoTab from "@/components/cliente/VentaEmpresaInfoTab";
import FaqTab from "@/components/cliente/FaqTab";
import UbicacionTab from "@/components/cliente/UbicacionTab";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

// Home pública (reemplazo del home de WordPress): mismos datos y componentes
// que /cliente, en un layout de scroll en vez de tabs, pensado para visitas
// que todavía no tienen cuenta. Precios en vivo por la misma razón que en
// /cliente: deben coincidir siempre con lo que /api/pagos/webpay/crear cobra.
export const dynamic = "force-dynamic";

const COMPROMISOS = [
  { emoji: "🌱", titulo: "Más Verde", texto: "Reciclamos el agua del lavado y reducimos el consumo por vehículo." },
  { emoji: "✨", titulo: "Más Limpio", texto: "Enjuague con agua desmineralizada: sin manchas de cal, sin rayas." },
  { emoji: "⚡", titulo: "Más Rápido", texto: "Túnel de lavado sin reserva de hora, entra y sal en minutos." },
];

export default async function LandingPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Image src="/logo.png" alt="ZPlash" width={30} height={30} className="topbar-logo" unoptimized />
          <span className="mode">ZPlash</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CarritoBadge />
          <Link href="/cliente" className="btn secondary" style={{ marginTop: 0, textDecoration: "none" }}>
            Mi cuenta
          </Link>
          <Link href="/pagar" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
            Activar plan
          </Link>
        </div>
      </div>

      <div className="cliente-hero">
        <h1>¡Dale a tu auto el brillo que merece!</h1>
        <p>
          Lavados sin rallas, enjuague con agua desmineralizada, y un plan mensual ilimitado para que no vuelvas a
          preocuparte por el lavado de tu auto.
        </p>
      </div>

      <div className="content">
        <TiposLavadoTab precios={precios} />

        <div className="card-grid" style={{ margin: "26px 0" }}>
          {COMPROMISOS.map((c) => (
            <div className="card" key={c.titulo}>
              <h3>
                {c.emoji} {c.titulo}
              </h3>
              <p style={{ color: "var(--gray)", fontSize: 14 }}>{c.texto}</p>
            </div>
          ))}
        </div>

        <h2 style={{ marginBottom: 12 }}>Venta a Empresa</h2>
        <VentaEmpresaInfoTab precios={precios} />

        <h2 style={{ margin: "26px 0 12px" }}>Preguntas Frecuentes</h2>
        <FaqTab />

        <h2 style={{ margin: "26px 0 12px" }}>Ubicación y Horarios</h2>
        <UbicacionTab />
      </div>
    </div>
  );
}
