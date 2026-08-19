import Link from "next/link";
import { Droplets, Car, Wind, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";
import TicketsCard from "./tiposLavado/TicketsCard";

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
      <div className="card-grid" style={{ marginBottom: 22 }}>
        <div className="card pricing-card">
          <div className="card-icon-title">
            <span className="icon-chip">
              <Droplets />
            </span>
            <h3>Lavado Full Tunnel</h3>
          </div>
          <p className="desc">
            Limpieza Exterior Full hecha por nosotros sin bajarte de tu auto y luego puedes usar zona de aspirado
            autoservicio todo el tiempo que quieras.
          </p>
          <div className="price-row">
            <span className="new">{precios ? fmtCLP(precios.lavadoUnico.precio) : "..."}</span>
            <span style={{ color: "var(--gray)", fontSize: 12.5 }}>Pago único, sin plan</span>
          </div>
          <ul className="pricing-card-features">
            <li>
              <Check /> Sin reserva de hora
            </li>
            <li>
              <Check /> Prelavado Hidrolavadora
            </li>
            <li>
              <Check /> Jabón SnowFoam Ph Neutro
            </li>
            <li>
              <Check /> Cepillos libres de Rayas
            </li>
            <li>
              <Check /> Enjuague
            </li>
            <li>
              <Check /> Cera y Secado
            </li>
          </ul>
          <Link href="/servicios/full-tunnel" className="btn secondary">
            Ver detalles
          </Link>
        </div>

        <div className="card pricing-card pricing-card--featured">
          <span className="pricing-card-badge">Más elegido</span>
          <div className="card-icon-title">
            <span className="icon-chip">
              <Car />
            </span>
            <h3>Plan X5</h3>
          </div>
          <p className="desc">5 lavados por el túnel durante 1 mes, desde la contratación.</p>
          <div className="price-row price-row--deal">
            {precios && precios.plan.precio > precios.planPrimera.precio && (
              <span className="old">{fmtCLP(precios.plan.precio)}</span>
            )}
            <span className="new">{precios ? fmtCLP(precios.planPrimera.precio) : "..."}</span>
            <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
          </div>
          <p style={{ color: "var(--gray)", fontSize: 12, marginBottom: 14 }}>
            Precio de 1ra contratación o renovando antes del vencimiento.
          </p>
          <ul className="pricing-card-features">
            <li>
              <Check /> Renovación automática, más barata
            </li>
            <li>
              <Check /> Te avisamos antes de que venza
            </li>
          </ul>
          <Link href="/servicios/plan-mensual" className="btn">
            Activar plan
          </Link>
        </div>

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

        <TicketsCard precios={precios} />
      </div>
    </div>
  );
}
