import Image from "next/image";
import Link from "next/link";
import { Wind, Clock, Ticket } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoHero from "@/components/cliente/ProductoHero";
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
            <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
          </Link>
          <span className="mode">Uso Zona Aspirado Autoservicio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CarritoBadge />
          <Link href="/cliente" className="btn secondary btn-mi-cuenta" style={{ marginTop: 0, textDecoration: "none" }}>
            Mi cuenta
          </Link>
        </div>
      </div>

      <div className="content">
        <Link href="/#lavados" className="landing-back">
          ← Volver a Tipos de Lavados
        </Link>

        <ProductoHero
          eyebrow="Autoservicio"
          titulo="Uso Zona Aspirado Autoservicio"
          descripcion="Estación de aspirado autoservicio disponible para cualquier cliente: pagas el uso puntual y aspiras tu auto tú mismo, sin límite de tiempo."
          imagen="/fondo-producto.jpg"
          features={[
            { icon: <Wind />, titulo: "Autoservicio", detalle: "Tú mismo limpias el interior, a tu ritmo." },
            { icon: <Clock />, titulo: "Sin límite de tiempo", detalle: "Usa la estación el tiempo que necesites en cada uso." },
            { icon: <Ticket />, titulo: "Con o sin plan", detalle: "Cualquier cliente puede pagar el uso puntual, tenga o no el Plan Mensual vigente." },
          ]}
        >
          <div className="price-row" style={{ marginTop: 20, marginBottom: 14 }}>
            <span className="new">{fmtCLP(precios.zonaAspirado.precio)}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/pagar?item=aspirado" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
              Comprar
            </Link>
            <AgregarCarritoButton item={{ key: "aspirado", tipo: "aspirado", nombre: "Uso Zona Aspirado Autoservicio", precio: precios.zonaAspirado.precio }} />
          </div>
        </ProductoHero>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={PREGUNTAS_ZONA_ASPIRADO} />
      </div>
    </div>
  );
}
