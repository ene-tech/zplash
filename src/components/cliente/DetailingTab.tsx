import Link from "next/link";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "./types";

export default function DetailingTab({ precios }: { precios: PreciosPublicos | null }) {
  const categorias = Array.from(new Set((precios?.servicios ?? []).map((s) => s.categoria || "Otros")));

  return (
    <div>
      <h2 className="section-title">SERVICIOS DE LIMPIEZA PROFESIONAL Y DETAILING AUTOMOTRIZ</h2>
      {!precios ? (
        <div className="empty">Cargando servicios...</div>
      ) : (
        categorias.map((cat) => (
          <div key={cat} style={{ marginBottom: 22 }}>
            <h3 style={{ marginBottom: 12 }}>{cat}</h3>
            <div className="service-grid">
              {precios.servicios
                .filter((s) => (s.categoria || "Otros") === cat)
                .map((s) => (
                  <Link href={`/servicios/${s.id}`} className="service-btn" key={s.id} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="nombre">{s.nombre}</div>
                    <div className="precio">{fmtCLP(s.precio)}</div>
                  </Link>
                ))}
            </div>
          </div>
        ))
      )}

      <div className="card" style={{ marginTop: 4 }}>
        <p style={{ color: "var(--gray)", fontSize: 13 }}>
          Los servicios adicionales (tapiz, alfombra, techo, motor, chasis) se pueden agregar a cualquier lavado
          completo. Consulta disponibilidad en el local o por WhatsApp.
        </p>
      </div>
    </div>
  );
}
