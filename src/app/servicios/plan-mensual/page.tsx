import Image from "next/image";
import Link from "next/link";
import { Car, CreditCard, Bell, Repeat, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoHero from "@/components/cliente/ProductoHero";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import AgregarCarritoButton from "@/components/cliente/AgregarCarritoButton";

const PREGUNTAS_PLAN_MENSUAL = [
  {
    q: "¿Qué incluye el Plan Ilimitado Mensual?",
    a: "Lavados ilimitados por el túnel durante 30 días desde la contratación, con un ingreso máximo por día. No incluye los servicios adicionales (tapiz, alfombra, techo, motor, chasis).",
  },
  {
    q: "¿Cuál es la diferencia entre pago período a período y renovación automática?",
    a: "Con pago período a período pagas un mes a la vez con tarjeta (Webpay Plus). Con la renovación automática inscribes tu tarjeta una vez y te cobramos cada mes automáticamente, a un precio más bajo.",
  },
  {
    q: "¿Cómo renuevo mi plan?",
    a: "Puedes renovarlo en el local, o desde la sección Pagar de nuestra web ingresando tu patente: ahí puedes pagar un período con tarjeta (Webpay Plus) o activar la renovación automática mensual.",
  },
  {
    q: "¿Qué pasa si mi plan vence?",
    a: "Puedes seguir viniendo y pagar un lavado único, o renovar tu plan apenas quieras. Te avisamos cuando esté por vencer.",
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: "En el local: efectivo, tarjeta y transferencia bancaria. Desde la web: tarjetas de crédito o débito a través de Webpay Plus, o renovación automática con Oneclick.",
  },
];

// Ver nota en /cliente/page.tsx: precios siempre frescos desde la base.
export const dynamic = "force-dynamic";

export default async function PlanMensualPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <div className="cliente-header">
        <div className="title">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/logo.png" alt="ZPlash" width={210} height={80} className="logo-principal" unoptimized />
          </Link>
          <span className="mode">Plan Mensual Ilimitado</span>
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
          eyebrow="Plan mensual"
          titulo="Plan Full Túnel Ilimitado"
          descripcion="Lavados ilimitados por el túnel durante todo el mes (un ingreso al día). Ideal para quienes usan el auto a diario y quieren mantenerlo siempre limpio sin pensar en pagar cada vez."
          imagen="/fondo-producto.jpg"
          features={[
            { icon: <Car />, titulo: "Lavados ilimitados", detalle: "Un ingreso al día por el túnel, durante 30 días desde la contratación." },
            { icon: <CreditCard />, titulo: "Dos formas de pagar", detalle: "Mes a mes con tarjeta, o renovación automática más barata." },
            { icon: <Bell />, titulo: "Te avisamos antes de que venza", detalle: "Para que no te quedes sin plan sin darte cuenta." },
          ]}
        />

        <div className="card-grid">
          <div className="card pricing-card">
            <div className="card-icon-title">
              <span className="icon-chip">
                <CreditCard />
              </span>
              <h3>Pago período a período</h3>
            </div>
            <p className="desc">Contrata o renueva un mes a la vez con cualquier tipo de tarjeta.</p>
            <div className="price-row">
              <span className="new">{fmtCLP(precios.plan.precio)}</span>
              <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
            </div>
            <ul className="pricing-card-features">
              <li>
                <Check /> Cualquier tarjeta (Webpay Plus)
              </li>
              <li>
                <Check /> Sin compromiso, renueva cuando quieras
              </li>
            </ul>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/pagar?item=plan" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Comprar
              </Link>
              <AgregarCarritoButton item={{ key: "plan", tipo: "plan_nuevo", nombre: "Plan Ilimitado Mensual", precio: precios.plan.precio }} />
            </div>
          </div>

          <div className="card pricing-card pricing-card--featured">
            <span className="pricing-card-badge">Más elegido</span>
            <div className="card-icon-title">
              <span className="icon-chip">
                <Repeat />
              </span>
              <h3>Renovación automática</h3>
            </div>
            <p className="desc">Inscribe tu tarjeta de crédito una vez y te cobramos automáticamente cada mes.</p>
            <div className="price-row">
              <span className="new">{fmtCLP(precios.planOneclick.precio)}</span>
              <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
            </div>
            <ul className="pricing-card-features">
              <li>
                <Check /> Ahorras {fmtCLP(precios.plan.precio - precios.planOneclick.precio)} al mes
              </li>
              <li>
                <Check /> Cancela cuando quieras
              </li>
            </ul>
            <Link href="/pagar?item=plan&auto=1" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
              Contratar
            </Link>
          </div>
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={PREGUNTAS_PLAN_MENSUAL} />
      </div>
    </div>
  );
}
