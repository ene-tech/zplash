"use client";

import { useState } from "react";
import { Ticket, Check } from "lucide-react";
import { fmtCLP } from "@/lib/helpers";
import type { PreciosPublicos } from "@/components/cliente/types";
import { FormularioCompraTickets } from "@/components/cliente/tiposLavado/FormularioCompraTickets";
import { ConsultaTickets } from "@/components/cliente/tiposLavado/ConsultaTickets";

// 4ta card de Tipo de Lavados (antes vivía como su propia zona "Venta
// Empresa" con 4 packs fijos de 10/20/30/40 — ver VentaEmpresaInfoTab,
// retirado). Ahora es un solo pack base de `cantidadMinima` tickets,
// ampliable a cualquier cantidad mayor desde el formulario de compra.
export default function TicketsCard({ precios }: { precios: PreciosPublicos | null }) {
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [consultaAbierta, setConsultaAbierta] = useState(false);
  const tickets = precios?.tickets;

  return (
    <div className="card pricing-card">
      <div className="card-icon-title">
        <span className="icon-chip">
          <Ticket />
        </span>
        <h3>Pack de Tickets 10/+</h3>
      </div>
      <p className="desc">
        Tickets de lavado prepagados para tu flota o tu día a día. Cómpralos por adelantado y úsalos cuando quieras.
      </p>
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
          <Check /> Asigna cada ticket a cualquier patente desde tu cuenta
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
