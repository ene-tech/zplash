import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import AnnounceBar from "@/components/cliente/AnnounceBar";
import DescuentoBienvenidaModal from "@/components/cliente/DescuentoBienvenidaModal";
import SiteNav from "@/components/cliente/SiteNav";
import TiposLavadoTab from "@/components/cliente/TiposLavadoTab";
import DetailingTab from "@/components/cliente/DetailingTab";
import FaqTab from "@/components/cliente/FaqTab";
import UbicacionTab from "@/components/cliente/UbicacionTab";
import LandingHero, { ComoFunciona, WhatsAppFlotante } from "@/components/cliente/LandingHero";
import { getPreciosPublicos } from "@/lib/preciosPublicos";

// Única puerta pública del sitio (reemplazo del home de WordPress): todo el
// contenido de venta en un layout de scroll. /cliente ya no duplica esto —
// quedó reducida a la cuenta del cliente logueado. Los precios tienen que
// coincidir siempre con lo que /api/pagos/webpay/crear cobra; eso ahora lo
// garantiza la invalidación por tag de getPreciosPublicos (ver
// TAG_CONTENIDO_PUBLICO) y no una lectura a la base por visitante.
export const dynamic = "force-dynamic";

// Subir un video a public/tunel/hero.mp4 lo pone de fondo en la portada.
const HAY_VIDEO_HERO = existsSync(path.join(process.cwd(), "public/tunel/hero.mp4"));

// Ficha del negocio para Google (datos estructurados schema.org). Tiene que
// coincidir con la ficha de Google Maps y con UbicacionTab: misma dirección,
// teléfono y horario, o Google no los asocia como el mismo negocio.
const NEGOCIO_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "AutoWash",
  name: "ZPlash",
  url: "https://zplash.cl",
  image: "https://zplash.cl/tunel/prelavado-portada3.jpg",
  telephone: "+56957969446",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Prieto Norte 71",
    addressLocality: "Temuco",
    addressRegion: "La Araucanía",
    addressCountry: "CL",
  },
  areaServed: "Temuco",
  openingHoursSpecification: [
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:30", closes: "20:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday", "Sunday"], opens: "10:00", closes: "19:00" },
  ],
};

export default async function LandingPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(NEGOCIO_JSON_LD) }} />
      <DescuentoBienvenidaModal valor={precios.descuentoBienvenida.valor} dias={precios.descuentoBienvenida.diasValidez} />
      <AnnounceBar />
      <SiteNav detailing={precios.servicios.length > 0} />
      <LandingHero precios={precios} video={HAY_VIDEO_HERO} />
      <WhatsAppFlotante />

      <div className="content">
        <div id="lavados" className="anchor-section">
          <TiposLavadoTab precios={precios} />
        </div>

        <div id="como-funciona" className="anchor-section">
          <ComoFunciona />
        </div>

        {precios.servicios.length > 0 && (
          <div id="detailing" className="anchor-section">
            <DetailingTab precios={precios} />
          </div>
        )}

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
