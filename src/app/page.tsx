import Link from "next/link";
import AnnounceBar from "@/components/cliente/AnnounceBar";
import DescuentoBienvenidaModal from "@/components/cliente/DescuentoBienvenidaModal";
import SiteNav from "@/components/cliente/SiteNav";
import TiposLavadoTab from "@/components/cliente/TiposLavadoTab";
import DetailingTab from "@/components/cliente/DetailingTab";
import FaqTab from "@/components/cliente/FaqTab";
import UbicacionTab from "@/components/cliente/UbicacionTab";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

// Única puerta pública del sitio (reemplazo del home de WordPress): todo el
// contenido de venta en un layout de scroll. /cliente ya no duplica esto —
// quedó reducida a la cuenta del cliente logueado. Los precios tienen que
// coincidir siempre con lo que /api/pagos/webpay/crear cobra; eso ahora lo
// garantiza la invalidación por tag de getPreciosPublicos (ver
// TAG_CONTENIDO_PUBLICO) y no una lectura a la base por visitante.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <DescuentoBienvenidaModal valor={precios.descuentoBienvenida.valor} dias={precios.descuentoBienvenida.diasValidez} />
      <AnnounceBar />
      <SiteNav />

      <div className="content">
        <div id="lavados" className="anchor-section">
          <TiposLavadoTab precios={precios} />
        </div>

        <div id="detailing" className="anchor-section">
          <DetailingTab precios={precios} />
        </div>

        <div id="faq" className="anchor-section">
          <h2 className="section-title">Preguntas Frecuentes</h2>
          <FaqTab />
          <p style={{ marginTop: 14, fontSize: 13, textAlign: "center" }}>
            <Link href="/politicas">Políticas de Funcionamiento y Garantía</Link>
          </p>
        </div>

        <div id="ubicacion" className="anchor-section">
          <h2 className="section-title">Ubicación y Horarios</h2>
          <UbicacionTab />
        </div>
      </div>
    </div>
  );
}
