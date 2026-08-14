import Link from "next/link";
import { Droplets, Clock, ListPlus } from "lucide-react";
import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoHero from "@/components/cliente/ProductoHero";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import AgregarCarritoButton from "@/components/cliente/AgregarCarritoButton";
import VolverBoton from "@/components/cliente/VolverBoton";

const PREGUNTAS_FULL_TUNNEL = [
  {
    q: "¿Qué incluye el Lavado Full Tunnel?",
    a: [
      "Un pase completo por nuestro túnel de lavado automático: prelavado, jabón, cepillado, enjuague y secado.",
      "Los servicios adicionales (tapiz, alfombra, techo, motor, chasis) se cotizan aparte.",
    ],
  },
  {
    q: "¿Necesito reservar hora?",
    a: "No. Para el lavado túnel puedes llegar directamente al local, sin reserva previa.",
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: [
      "En el local: efectivo, tarjeta y transferencia bancaria.",
      "Desde la web: tarjetas de crédito o débito a través de Webpay Plus.",
    ],
  },
  {
    q: "¿Tienen descuento para mi primera visita?",
    a: [
      'Sí. Escríbenos por WhatsApp con la palabra "descuento" seguida de tu patente.',
      "Te enviamos un código de descuento válido por 7 días.",
    ],
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
      <ClienteHeader titulo="Lavado Full Tunnel" />

      <div className="content">
        <VolverBoton href="/#lavados" label="Volver a Tipos de Lavados" />

        <ProductoHero
          eyebrow="Lavado por túnel"
          titulo="Lavado Full Tunnel"
          descripcion="Nosotros lavamos el exterior de tu auto en minutos y luego puedes usar todo el tiempo que quieras la zona de aspirado autoservicio para limpiar el interior."
          imagen="/fondo-producto.jpg"
          features={[
            { icon: <Droplets />, titulo: "Lavado completo", detalle: "Prelavado, jabón, cepillado, enjuague y secado en un solo pase." },
            { icon: <Clock />, titulo: "Sin reserva de hora", detalle: "Llega directo al local cuando quieras, sin agendar." },
            { icon: <ListPlus />, titulo: "Servicios adicionales aparte", detalle: "Tapiz, alfombra, techo, motor y chasis se cotizan por separado." },
          ]}
        >
          <div className="price-row" style={{ marginTop: 20, marginBottom: 14 }}>
            <span className="new">{fmtCLP(precios.lavadoUnico.precio)}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/pagar?item=lavado_unico" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
              Comprar
            </Link>
            <AgregarCarritoButton item={{ key: "lavado_unico", tipo: "lavado_unico", nombre: "Lavado Full Tunnel", precio: precios.lavadoUnico.precio }} />
          </div>
        </ProductoHero>

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
