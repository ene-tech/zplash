import Image from "next/image";
import Link from "next/link";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";

export default function TiposLavadoTab({ precios }: { precios: PreciosPublicos | null }) {
  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>LAVADOS EXTERIOR TUNEL + USO ILIMITADO ESTACIONES DE ASPIRADO</h2>
      <div className="landing-banners" style={{ marginBottom: 22 }}>
        <Link href="/servicios/full-tunnel" className="landing-banner">
          <Image src="/fondo-producto.jpg" alt="Lavado Full Tunnel" fill unoptimized />
          <div className="overlay">
            <h3>🚿 Lavado Full Tunnel</h3>
            <p>Un pase completo por nuestro túnel, sin reserva de hora.</p>
            <p className="price">{precios ? fmtCLP(precios.lavadoUnico.precio) : "..."}</p>
            <span className="ver-mas">Ver detalles →</span>
          </div>
        </Link>
        <Link href="/servicios/plan-mensual" className="landing-banner">
          <Image src="/fondo-producto.jpg" alt="Plan Mensual Ilimitado" fill unoptimized />
          <div className="overlay">
            <h3>🚗 Plan Mensual Ilimitado</h3>
            <p>Lavados ilimitados por el túnel durante todo el mes.</p>
            <p className="price">{precios ? `Desde ${fmtCLP(precios.planOneclick.precio)} / mes` : "..."}</p>
            <span className="ver-mas">Ver detalles →</span>
          </div>
        </Link>
        <Link href="/servicios/zona-aspirado" className="landing-banner">
          <Image src="/fondo-producto.jpg" alt="Uso Zona Aspirado Autoservicio" fill unoptimized />
          <div className="overlay">
            <h3>🧹 Uso Zona Aspirado Autoservicio</h3>
            <p>Estación de aspirado autoservicio, sin límite de tiempo por uso.</p>
            <p className="price">{precios ? fmtCLP(precios.zonaAspirado.precio) : "..."}</p>
            <span className="ver-mas">Ver detalles →</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
