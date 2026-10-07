import type { Metadata } from "next";
import Link from "next/link";
import { Ticket, Clock, Car } from "lucide-react";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import { fmtCLP } from "@/lib/helpers";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import ProductoHero from "@/components/cliente/ProductoHero";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import EscaleraTickets from "@/components/cliente/tiposLavado/EscaleraTickets";
import { WhatsAppFlotante } from "@/components/cliente/LandingHero";

// Landing para compartir (WhatsApp, redes) la compra de tickets de lavado:
// 1, 2 o 4, pago único por Webpay y sin plan — pensada para quien le tiene
// miedo a suscribirse. El Plan X5 con cobro automático no se ofrece acá a
// propósito; vive en la landing (/) y en /servicios/plan-mensual.
export const metadata: Metadata = {
  title: "Tickets de lavado de autos en Temuco · 1, 2 o 4 lavados | ZPlash",
  description:
    "Compra tus lavados Full Tunnel por adelantado, sin plan: 1, 2 o 4 tickets para tu auto. Mientras más llevas, menos pagas por cada lavado.",
  alternates: { canonical: "/tickets" },
  openGraph: {
    title: "Tickets de lavado ZPlash · 1, 2 o 4 lavados, sin plan",
    description: "Lavado exterior en túnel + aspirado sin límite de tiempo. Compra tus tickets y úsalos cuando quieras.",
    images: ["/tunel/prelavado-portada3.jpg"],
  },
};

// Precios siempre frescos desde la base, igual que el resto de las páginas con precio.
export const dynamic = "force-dynamic";

const FOTOS = [
  { src: "/tunel-bn.webp", alt: "Auto cubierto de espuma entre los cepillos del túnel de lavado" },
  { src: "/tunel/prelavado-agua.jpg", alt: "Operario enjuagando a presión un auto antes de entrar al túnel" },
  { src: "/tunel/entrada-tunel.jpg", alt: "Entrada del túnel de lavado Zplash con sus cepillos" },
  { src: "/tunel/aspirado.jpg", alt: "Zona de aspirado autoservicio con aspiradoras y pistolas de aire" },
];

export default async function TicketsPage() {
  const precios = await getPreciosPublicos();
  const cinco = precios.promo5Lavados;

  const preguntas = [
    {
      q: "¿Cómo uso mis tickets?",
      a: [
        "Quedan cargados a la patente que ingresas al comprar.",
        "Llegas al local, leemos tu patente y pasas: no necesitas mostrar ningún código.",
      ],
    },
    {
      q: "¿Esto es un plan o una suscripción?",
      a: "No. Pagas una sola vez con Webpay y no se te vuelve a cobrar. Cuando se te acaben, compras de nuevo si quieres.",
    },
    {
      q: "¿Cuánto duran los tickets?",
      a: `Los packs de tickets se usan dentro de ${cinco.vigenciaDias} días desde la compra.`,
    },
    {
      q: "¿Puedo usarlos en otro auto?",
      a: "No, son para la patente con la que los compraste.",
    },
    {
      q: "¿Necesito reservar hora?",
      a: "No. Llega directo al local cuando quieras, dentro del horario de atención.",
    },
  ];

  return (
    <div id="app">
      <ClienteHeader titulo="Tickets de Lavado" />

      <div className="content">
        <ProductoHero
          eyebrow="Lavado por túnel · Temuco"
          titulo="Tickets de lavado, sin plan"
          descripcion="Compra tus lavados Full Tunnel por adelantado y úsalos cuando quieras. Lavamos el exterior de tu auto en minutos y después usas la zona de aspirado todo el tiempo que necesites."
          imagen={FOTOS}
          features={[
            { icon: <Ticket />, titulo: "Pago único", detalle: "Pagas una vez con Webpay. Sin plan, sin cobros automáticos." },
            { icon: <Car />, titulo: "Cargados a tu patente", detalle: "En el local leemos tu patente y pasas, sin códigos." },
            { icon: <Clock />, titulo: "Sin reserva de hora", detalle: "Llega directo al local cuando quieras." },
          ]}
        >
          {cinco.precio > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 8 }}>
                {cinco.lavados} lavados por {fmtCLP(cinco.precio)}: {fmtCLP(cinco.precio / cinco.lavados)} cada uno.
              </p>
              <Link href="/pagar?item=promo_5_lavados" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Comprar {cinco.lavados} tickets
              </Link>
            </div>
          )}
        </ProductoHero>

        <h2 className="section-title">Elige cuántos lavados</h2>
        <EscaleraTickets precios={precios} />

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={preguntas} />

        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          <Link href="/">Ver todos los servicios de ZPlash</Link>
          {" · "}
          <Link href="/politicas">Políticas de Funcionamiento y Garantía</Link>
        </p>
      </div>
      <WhatsAppFlotante />
    </div>
  );
}
