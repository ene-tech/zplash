import Image from "next/image";
import Link from "next/link";
import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoBanner from "@/components/cliente/ProductoBanner";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import AgregarCarritoButton from "@/components/cliente/AgregarCarritoButton";

const PREGUNTAS_FULL_TUNNEL = [
  {
    q: "¿Qué incluye el Lavado Full Tunnel?",
    a: "Un pase completo por nuestro túnel de lavado automático: prelavado, jabón, cepillado, enjuague y secado. Los servicios adicionales (tapiz, alfombra, techo, motor, chasis) se cotizan aparte.",
  },
  {
    q: "¿Necesito reservar hora?",
    a: "No. Para el lavado túnel puedes llegar directamente al local, sin reserva previa.",
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: "En el local: efectivo, tarjeta y transferencia bancaria. Desde la web: tarjetas de crédito o débito a través de Webpay Plus.",
  },
  {
    q: "¿Tienen descuento para mi primera visita?",
    a: 'Sí. Escríbenos por WhatsApp con la palabra "descuento" seguida de tu patente y te enviamos un código de descuento válido por 7 días.',
  },
  {
    q: "Si lavo seguido, ¿me conviene más el Plan Mensual Ilimitado?",
    a: "Si vienes 3 o más veces al mes, sí: pagas una vez y puedes lavar todos los días que quieras. Revisa el Plan Mensual Ilimitado para comparar precios.",
  },
];

// Ver nota en /cliente/page.tsx: precios siempre frescos desde la base.
export const dynamic = "force-dynamic";

export default async function FullTunnelPage() {
  const precios = await getPreciosPublicos();
  const relacionados = precios.servicios.filter((s) => s.categoria === CATEGORIA_DETAILING);

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={30} height={30} className="topbar-logo" unoptimized />
          </Link>
          <span className="mode">Lavado Full Tunnel</span>
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
          <ProductoBanner imagen="/fondo-producto.jpg" alt="Lavado Full Tunnel" />
          <h3>🚿 Lavado Full Tunnel</h3>
          <div className="price-row" style={{ marginBottom: 14 }}>
            <span className="new">{fmtCLP(precios.lavadoUnico.precio)}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/pagar?item=lavado_unico" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
              Comprar
            </Link>
            <AgregarCarritoButton item={{ key: "lavado_unico", tipo: "lavado_unico", nombre: "Lavado Full Tunnel", precio: precios.lavadoUnico.precio }} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Cómo funciona</h3>
          <p style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6 }}>
            Un pase completo por nuestro túnel de lavado: para quienes no tienen el Plan Ilimitado Mensual vigente y
            quieren su auto limpio sin reservar hora.
          </p>
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={PREGUNTAS_FULL_TUNNEL} />

        {relacionados.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h3 style={{ marginBottom: 12 }}>También te podría interesar</h3>
            <div className="service-grid">
              {relacionados.map((s) => (
                <Link href={`/servicios/${s.id}`} className="service-btn" key={s.id} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="nombre">{s.nombre}</div>
                  <div className="precio">{fmtCLP(s.precio)}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
