import Link from "next/link";
import { Car, CreditCard, Bell, Repeat, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import { getPreciosPublicos } from "@/lib/preciosPublicos";
import FaqAccordion from "@/components/cliente/FaqAccordion";
import ProductoHero from "@/components/cliente/ProductoHero";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import VolverBoton from "@/components/cliente/VolverBoton";

const PREGUNTAS_PLAN_MENSUAL = [
  {
    q: "¿Qué incluye el Plan X5?",
    a: [
      "5 lavados Full Túnel durante el mes que va desde la contratación.",
      "Máximo 1 ingreso cada 24 horas.",
      "Aspirado autoservicio sin límite de tiempo, en cada uno de los 5 lavados, después de pasar por el túnel.",
      "Válido para una patente; puede cambiarse al término del período.",
      "Para vehículos de uso particular o empresa; prohibido para transporte público, taxi, Uber o colectivos.",
    ],
  },
  {
    q: "¿Cómo contrato o renuevo mi plan?",
    a: [
      "En el local.",
      "Desde la web, en la sección Pagar, ingresando tu patente e inscribiendo tu tarjeta.",
      "El plan se cobra siempre con renovación automática mensual: no hay que acordarse de pagarlo, y se cancela cuando quieras.",
    ],
  },
  {
    q: "¿Qué pasa si mi plan vence?",
    a: [
      "Puedes seguir viniendo y pagar un lavado único.",
      "Puedes renovar tu plan apenas quieras.",
      "Te avisamos cuando esté por vencer.",
    ],
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: [
      "En el local: efectivo, tarjeta y transferencia bancaria.",
      "El plan, desde la web: tarjeta de crédito inscrita con Oneclick (renovación automática).",
      "Lavado único, zona de aspirado y servicios de detailing, desde la web: tarjetas de crédito o débito a través de Webpay Plus.",
    ],
  },
];

// Ver nota en /cliente/page.tsx: precios siempre frescos desde la base.
export const dynamic = "force-dynamic";

export default async function PlanMensualPage() {
  const precios = await getPreciosPublicos();

  return (
    <div id="app">
      <ClienteHeader titulo="Plan X5" />

      <div className="content">
        <VolverBoton href="/#lavados" label="Volver a Tipos de Lavados" />

        <ProductoHero
          eyebrow="Plan mensual"
          titulo="Plan X5 Full Túnel"
          descripcion="5 lavados por el túnel al mes (un ingreso al día). Ideal para quienes usan el auto a diario y quieren mantenerlo siempre limpio sin pensar en pagar cada vez."
          imagen="/fondo-producto.jpg"
          features={[
            { icon: <Car />, titulo: "5 lavados al mes", detalle: "Un ingreso al día por el túnel, durante el mes que va desde la contratación." },
            { icon: <CreditCard />, titulo: "Se renueva solo", detalle: "Inscribes tu tarjeta una vez y se cobra cada mes; cancelas cuando quieras." },
            { icon: <Bell />, titulo: "Te avisamos antes de que venza", detalle: "Para que no te quedes sin plan sin darte cuenta." },
          ]}
        />

        {/* Una sola forma de contratar el plan: inscribiendo la tarjeta. El
            plan no se vende por Webpay (ver TIPOS_VALIDOS en
            /api/pagos/webpay/crear), así que tampoco se agrega al carrito. */}
        <div className="card-grid">
          <div className="card pricing-card pricing-card--featured">
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
                <Check /> Sin trámite todos los meses
              </li>
              <li>
                <Check /> Cancela cuando quieras
              </li>
            </ul>
            <Link href="/pagar?item=plan" className="btn" style={{ marginTop: 0, textDecoration: "none" }}>
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
