import Image from "next/image";
import Link from "next/link";
import { fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoBanner from "@/components/cliente/ProductoBanner";
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
            <Image src="/logo.png" alt="ZPlash" width={30} height={30} className="topbar-logo" unoptimized />
          </Link>
          <span className="mode">Plan Mensual Ilimitado</span>
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

        <div className="card-grid">
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <ProductoBanner imagen="/plan-mensual.jpg" alt="Plan Full Túnel Ilimitado" />
            <h3>🚗 Plan Full Túnel Ilimitado</h3>
          </div>

          <div className="card">
            <h3>Pago período a período</h3>
            <p style={{ color: "var(--gray)", fontSize: 13, marginBottom: 12 }}>
              Contrata o renueva un mes a la vez con cualquier tipo de tarjeta (Webpay Plus).
            </p>
            <div className="price-row" style={{ marginBottom: 14 }}>
              <span className="new">{fmtCLP(precios.plan.precio)}</span>
              <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/pagar?item=plan" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Comprar
              </Link>
              <AgregarCarritoButton item={{ key: "plan", tipo: "plan_nuevo", nombre: "Plan Ilimitado Mensual", precio: precios.plan.precio }} />
            </div>
          </div>

          <div className="card">
            <h3>Renovación automática</h3>
            <p style={{ color: "var(--gray)", fontSize: 13, marginBottom: 12 }}>
              Inscribe tu Tarjeta de Crédito una vez y te cobramos automáticamente cada mes, más barato.
            </p>
            <div className="price-row" style={{ marginBottom: 0 }}>
              <span className="new">{fmtCLP(precios.planOneclick.precio)}</span>
              <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
            </div>
            <div className="save" style={{ marginTop: 6 }}>
              Ahorras {fmtCLP(precios.plan.precio - precios.planOneclick.precio)} al mes
            </div>
            <div style={{ marginTop: 12 }}>
              <Link href="/pagar?item=plan&auto=1" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Contratar
              </Link>
            </div>
          </div>

          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <h3>Cómo funciona</h3>
            <p style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6 }}>
              Lavados ilimitados por el túnel durante todo el mes (un ingreso al día). Ideal para quienes usan el
              auto a diario y quieren mantenerlo siempre limpio sin pensar en pagar cada vez.
            </p>
          </div>

          <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center" }}>
            <a href="/pagar" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Contratar o renovar mi plan
            </a>
          </div>
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Preguntas frecuentes</h3>
        <FaqAccordion preguntas={PREGUNTAS_PLAN_MENSUAL} />
      </div>
    </div>
  );
}
