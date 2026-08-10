import Image from "next/image";
import Link from "next/link";
import TiposLavadoTab from "@/components/cliente/TiposLavadoTab";
import DetailingTab from "@/components/cliente/DetailingTab";
import VentaEmpresaInfoTab from "@/components/cliente/VentaEmpresaInfoTab";
import FaqTab from "@/components/cliente/FaqTab";
import UbicacionTab from "@/components/cliente/UbicacionTab";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

// Única puerta pública del sitio (reemplazo del home de WordPress): todo el
// contenido de venta en un layout de scroll. /cliente ya no duplica esto —
// quedó reducida a la cuenta del cliente logueado. Precios en vivo porque
// deben coincidir siempre con lo que /api/pagos/webpay/crear cobra.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={30} height={30} className="topbar-logo" unoptimized />
          </Link>
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

        <div style={{ margin: "26px 0" }}>
          <DetailingTab precios={precios} />
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
