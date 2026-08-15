import AnnounceBar from "@/components/cliente/AnnounceBar";
import SiteNav from "@/components/cliente/SiteNav";
import TiposLavadoTab from "@/components/cliente/TiposLavadoTab";
import DetailingTab from "@/components/cliente/DetailingTab";
import FaqTab from "@/components/cliente/FaqTab";
import UbicacionTab from "@/components/cliente/UbicacionTab";
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
        </div>

        <div id="ubicacion" className="anchor-section">
          <h2 className="section-title">Ubicación y Horarios</h2>
          <UbicacionTab />
        </div>
      </div>
    </div>
  );
}
