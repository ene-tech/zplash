import Link from "next/link";
import { Car, Wind, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";
import TicketsCard from "./tiposLavado/TicketsCard";
import EscaleraTickets from "./tiposLavado/EscaleraTickets";

// Dos formas de comprar el mismo lavado: tickets de pago único por Webpay
// (EscaleraTickets: 1, 2 o 4, para quien no quiere un plan) y el Plan X5 con
// cobro automático Oneclick, que va en la misma fila bajo su propio título.
// El Pack de Tickets 10/+ va debajo, a lo ancho, como venta empresa.
export default function TiposLavadoTab({ precios }: { precios: PreciosPublicos | null }) {

  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 transform-gpu overflow-hidden blur-3xl"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="mx-auto aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-[var(--gold)] to-[#ffe08a] opacity-25"
        />
      </div>

      <h2 className="section-title">
        LAVADO EXTERIOR TUNEL
        <br />
        <span className="section-title-indent">+ ASPIRADO SIN LÍMITE DE TIEMPO</span>
      </h2>
      <p style={{ color: "var(--gray)", fontSize: 14, margin: "-6px 0 18px" }}>
        Compra tus tickets de una vez, sin plan: mientras más llevas, menos pagas por cada lavado.
      </p>
      {precios && (
        <EscaleraTickets precios={precios} tituloExtra="Plan mensual">
          <PlanX5Card precios={precios} />
        </EscaleraTickets>
      )}

      <h3 style={{ margin: "8px 0 12px" }}>Venta empresa, convenios, familias</h3>
      <div style={{ marginBottom: 22 }}>
        <TicketsCard precios={precios} />
      </div>

      <h3 style={{ margin: "8px 0 12px" }}>Otras opciones</h3>
      <div className="card-grid" style={{ marginBottom: 22 }}>
        <div className="card pricing-card">
          <div className="card-icon-title">
            <span className="icon-chip">
              <Wind />
            </span>
            <h3>Zona Aspirado Autoservicio</h3>
          </div>
          <p className="desc">
            Uso único de estación de aspirado autoservicio para el interior de tu auto, cuando no
            necesitas lavar el exterior de tu auto.
          </p>
          <div className="price-row">
            <span className="new">{precios ? fmtCLP(precios.zonaAspirado.precio) : "..."}</span>
          </div>
          <ul className="pricing-card-features">
            <li>
              <Check /> Sin límite de tiempo por uso
            </li>
          </ul>
          <Link href="/servicios/zona-aspirado" className="btn secondary">
            Ver detalles
          </Link>
        </div>
      </div>
    </div>
  );
}

// Va como 4ta tarjeta de la escalera, al lado de los packs de pago único.
function PlanX5Card({ precios }: { precios: PreciosPublicos }) {
  return (
    <div className="card pricing-card pricing-card--featured">
      <span className="pricing-card-badge">¿Lavas todos los meses?</span>
      <div className="card-icon-title">
        <span className="icon-chip">
          <Car />
        </span>
        <h3>Plan X5 · cobro automático</h3>
      </div>
      <p className="desc">
        5 lavados por el túnel cada mes, sin preocuparte de volver a comprar: se cobra solo a tu tarjeta con
        Oneclick.
      </p>
      <div className="price-row" style={{ marginTop: 14, marginBottom: 4 }}>
        <span className="new">{fmtCLP(precios.planOneclick.precio)}</span>
        <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
      </div>
      <ul className="pricing-card-features" style={{ marginTop: 10 }}>
        <li>
          <Check /> Renovación automática con tu tarjeta
        </li>
        <li>
          <Check /> Te avisamos antes de que venza
        </li>
      </ul>
      <Link href="/servicios/plan-mensual" className="btn" style={{ textDecoration: "none" }}>
        Activar plan
      </Link>
    </div>
  );
}
