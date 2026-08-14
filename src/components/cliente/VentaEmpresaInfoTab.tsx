"use client";

import { useState } from "react";
import { Truck, FileBarChart, Receipt, Mail } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";
import ProductoHero from "@/components/cliente/ProductoHero";
import { FormularioCompra } from "@/components/cliente/ventaEmpresaInfo/FormularioCompra";
import { ConsultaTickets } from "@/components/cliente/ventaEmpresaInfo/ConsultaTickets";

const WHATSAPP_URL = "https://wa.me/56957969446?text=" + encodeURIComponent("Hola, quiero cotizar lavados para mi empresa");
const EMAIL = "TB@ZPLASH.CL";

export default function VentaEmpresaInfoTab({ precios }: { precios: PreciosPublicos | null }) {
  const [packAbierto, setPackAbierto] = useState<number | null>(null);

  return (
    <div>
      <ProductoHero
        eyebrow="Pack de Tickets"
        titulo="Packs de tickets para tu flota"
        descripcion="Packs de tickets de lavado para tu empresa, sin el vencimiento de 90 días de otros productos. Ideal para automotoras, rent a car y talleres mecánicos."
        imagen="/fondo-producto.jpg"
        features={[
          { icon: <Truck />, titulo: "Control absoluto de tu flota", detalle: "Úsalos en los vehículos que definas: déjalos abiertos para cualquier patente, o entréganos las patentes de tu flota." },
          { icon: <FileBarChart />, titulo: "Reporte de uso", detalle: "Consulta cuándo y en qué patente se usó cada ticket con el RUT de tu empresa, sin depender de que te enviemos el detalle." },
          { icon: <Receipt />, titulo: "Boleta o factura", detalle: "Precios con IVA incluido. Emitimos boleta o factura a nombre de tu empresa, pagando el pack completo por adelantado con Webpay." },
        ]}
      />

      <h3 style={{ marginBottom: 12 }}>Packs de tickets</h3>
      <div className="card-grid" style={{ marginBottom: 22 }}>
        {(precios?.packsEmpresa ?? []).map((p) => (
          <div className="card" key={p.cantidad}>
            <h3>{p.cantidad} Tickets</h3>
            <div className="price-row" style={{ marginBottom: 6 }}>
              <span className="new">{fmtCLP(p.precio)}</span>
            </div>
            <p style={{ color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
              Cada lavado te queda en {fmtCLP(Math.round(p.precio / p.cantidad))}
            </p>
            <button
              className="btn"
              style={{ marginTop: 0 }}
              onClick={() => setPackAbierto(packAbierto === p.cantidad ? null : p.cantidad)}
            >
              {packAbierto === p.cantidad ? "Cerrar" : "Comprar"}
            </button>
            {packAbierto === p.cantidad && <FormularioCompra cantidad={p.cantidad} precio={p.precio} />}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-icon-title">
          <span className="icon-chip">
            <Mail />
          </span>
          <h3>¿Necesitas otra cantidad?</h3>
        </div>
        <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
          Si necesitas más tickets o una cantidad distinta a los packs de arriba, cuéntanos y te enviamos una
          cotización.
        </p>
        <div className="map-actions">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn">
            Cotizar por WhatsApp
          </a>
          <a href={`mailto:${EMAIL}`} className="btn ghost">
            {EMAIL}
          </a>
        </div>
      </div>

      <ConsultaTickets />
    </div>
  );
}
