"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ticket, Check, Car, LayoutDashboard } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";
import { FormularioCompraTickets } from "@/components/cliente/tiposLavado/FormularioCompraTickets";
import { ConsultaTickets } from "@/components/cliente/tiposLavado/ConsultaTickets";

// 4ta card de Tipo de Lavados (antes vivía como su propia zona "Venta
// Empresa" con 4 packs fijos de 10/20/30/40 — ver VentaEmpresaInfoTab,
// retirado). Ahora es un solo pack base de `cantidadMinima` tickets,
// ampliable a cualquier cantidad mayor desde el formulario de compra.
const DESTACADOS = [
  {
    icono: <Car />,
    titulo: "Abierto a cualquier patente",
    detalle: "No quedan atados a un auto: úsalos en el que quieras, o limítalos a las patentes de tu flota.",
  },
  {
    icono: <LayoutDashboard />,
    titulo: "Gestión desde la plataforma",
    detalle: "En Mi Cuenta puedes gestionar cada ticket, asignar reglas de patente y recibir informe de uso.",
  },
];

// `linkLanding`: la card entera lleva a /pack-tickets (salvo sus botones y el
// formulario de compra, que siguen haciendo lo suyo); se apaga cuando la card
// ya vive dentro de esa landing.
export default function TicketsCard({ precios, linkLanding = true }: { precios: PreciosPublicos | null; linkLanding?: boolean }) {
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [consultaAbierta, setConsultaAbierta] = useState(false);
  const tickets = precios?.tickets;
  const router = useRouter();

  function irALanding(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, label") || target.closest(".card") !== e.currentTarget) return;
    router.push("/pack-tickets");
  }

  return (
    <div
      className="card pricing-card"
      onClick={linkLanding ? irALanding : undefined}
      style={linkLanding ? { cursor: "pointer" } : undefined}
    >
      <span className="pricing-card-badge">Para cualquier patente</span>
      <div className="card-icon-title">
        <span className="icon-chip">
          <Ticket />
        </span>
        <h3>
          {linkLanding ? (
            <Link href="/pack-tickets" style={{ color: "inherit", textDecoration: "none" }}>
              Pack de Tickets 10/+
            </Link>
          ) : (
            "Pack de Tickets 10/+"
          )}
        </h3>
      </div>
      <p className="desc">
        Tickets de lavado prepagados para tu flota, tu familia o tu día a día. Cómpralos por adelantado y úsalos cuando
        quieras.
      </p>
      <div style={{ display: "grid", gap: 8, margin: "12px 0 14px" }}>
        {DESTACADOS.map((d) => (
          <div
            key={d.titulo}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--gold)",
              background: "rgba(255, 196, 0, 0.08)",
            }}
          >
            <span className="icon-chip" style={{ flex: "0 0 auto" }}>
              {d.icono}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.35 }}>
              <strong style={{ display: "block", fontSize: 14 }}>{d.titulo}</strong>
              <span style={{ color: "var(--gray)" }}>{d.detalle}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="price-row">
        <span className="new">{tickets ? fmtCLP(tickets.precioBase) : "..."}</span>
        <span style={{ color: "var(--gray)", fontSize: 12.5 }}>
          {tickets ? `${fmtCLP(tickets.precioUnitario)} c/u` : ""}
        </span>
      </div>
      <ul className="pricing-card-features">
        <li>
          <Check /> Válido {tickets?.vigenciaDias ?? 45} días desde la compra
        </li>
        <li>
          <Check /> Agrega los que quieras desde {tickets ? tickets.cantidadMinima : 10}
        </li>
        <li>
          <Check /> Boleta o factura, IVA incluido
        </li>
      </ul>
      <button className="btn secondary" onClick={() => setCompraAbierta((v) => !v)}>
        {compraAbierta ? "Cerrar" : "Comprar"}
      </button>
      {compraAbierta && tickets && (
        <FormularioCompraTickets
          cantidadMinima={tickets.cantidadMinima}
          cantidadMaxima={tickets.cantidadMaxima}
          precioUnitario={tickets.precioUnitario}
        />
      )}

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 10, fontSize: 12.5, padding: "8px 10px" }}
        onClick={() => setConsultaAbierta((v) => !v)}
      >
        {consultaAbierta ? "Ocultar" : "¿Ya compraste? Consulta tus tickets"}
      </button>
      {consultaAbierta && (
        <div style={{ marginTop: 12 }}>
          <ConsultaTickets />
        </div>
      )}
    </div>
  );
}
