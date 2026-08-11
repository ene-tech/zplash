import Link from "next/link";
import { Droplets, Car, Wind, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";

export default function TiposLavadoTab({ precios }: { precios: PreciosPublicos | null }) {
  return (
    <div>
      <h2 className="section-title">
        LAVADO EXTERIOR TUNEL
        <br />
        <span style={{ marginLeft: "173px" }}>
          + USO ILIMITADO ESTACIONES DE ASPIRADO
        </span>
      </h2>
      <div className="card-grid" style={{ marginBottom: 22 }}>
        <div className="card pricing-card">
          <div className="card-icon-title">
            <span className="icon-chip">
              <Droplets />
            </span>
            <h3>Lavado Full Tunnel</h3>
          </div>
          <p className="desc">Un pase completo por nuestro túnel de lavado.</p>
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
            <h3>Plan Mensual Ilimitado</h3>
          </div>
          <p className="desc">Lavados ilimitados por el túnel durante 1 mes, desde la contratación.</p>
          <div className="price-row">
            <span className="new">{precios ? fmtCLP(precios.planOneclick.precio) : "..."}</span>
            <span style={{ color: "var(--gray)", fontSize: 12.5 }}>/ mes</span>
          </div>
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
          <p className="desc">Estación de aspirado autoservicio para el interior de tu auto.</p>
          <div className="price-row">
            <span className="new">{precios ? fmtCLP(precios.zonaAspirado.precio) : "..."}</span>
          </div>
          <ul className="pricing-card-features">
            <li>
              <Check /> Sin límite de tiempo por uso
            </li>
            <li>
              <Check /> Con o sin plan vigente
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
