import Image from "next/image";
import Link from "next/link";
import { fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoBanner from "@/components/cliente/ProductoBanner";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import AgregarCarritoButton from "@/components/cliente/AgregarCarritoButton";

const PREGUNTAS_ZONA_ASPIRADO = [
  {
    q: "¿Qué incluye el Uso Zona Aspirado Autoservicio?",
    a: "Acceso a una estación de aspirado autoservicio para que limpies el interior de tu auto tú mismo, sin límite de tiempo por uso.",
  },
  {
    q: "¿Necesito reservar hora?",
    a: "No. Puedes llegar directamente a la zona de aspirado, sin reserva previa.",
  },
  {
    q: "¿Puedo usarla si no tengo el Plan Mensual Ilimitado?",
    a: "Sí, cualquier cliente puede pagar el uso puntual de la zona de aspirado, tenga o no plan vigente.",
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: "En el local: efectivo, tarjeta y transferencia bancaria. Desde la web: tarjetas de crédito o débito a través de Webpay Plus.",
  },
];

// Ver nota en /cliente/page.tsx: precios siempre frescos desde la base.
export const dynamic = "force-dynamic";

export default async function ZonaAspiradoPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={30} height={30} className="topbar-logo" unoptimized />
          </Link>
          <span className="mode">Uso Zona Aspirado Autoservicio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CarritoBadge />
          <a href="/pagar" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
            Pagar / Renovar plan
          </a>
        </div>
      </div>

      <div className="content">
        <a href="/cliente" className="landing-back">
          ← Volver a Tipos de Lavados
        </a>

        <div className="card" style={{ marginBottom: 18 }}>
          <ProductoBanner imagen="/servicios-precios.jpg" alt="Uso Zona Aspirado Autoservicio" />
          <h3>🧹 Uso Zona Aspirado Autoservicio</h3>
          <div className="price-row" style={{ marginBottom: 14 }}>
            <span className="new">{fmtCLP(precios.zonaAspirado.precio)}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/pagar?item=aspirado" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
              Comprar
            </Link>
            <AgregarCarritoButton item={{ key: "aspirado", tipo: "aspirado", nombre: "Uso Zona Aspirado Autoservicio", precio: precios.zonaAspirado.precio }} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Cómo funciona</h3>
          <p style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6 }}>
            Estación de aspirado autoservicio disponible para cualquier cliente: pagas el uso puntual y aspiras tu
            auto tú mismo, sin límite de tiempo.
          </p>
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={PREGUNTAS_ZONA_ASPIRADO} />
      </div>
    </div>
  );
}
