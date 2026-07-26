"use client";

import { useState } from "react";
import { isValidRut } from "@/lib/helpers";

interface TicketConsulta {
  codigo: string;
  nombreLote: string;
  numeroLote: number;
  totalLote: number;
  estado: string;
  patenteUso: string | null;
  fechaUso: string | null;
}

function estadoClase(estado: string): "ok" | "warn" | "bad" {
  if (estado === "Usado") return "ok";
  if (estado === "Caducado") return "bad";
  return "warn";
}

export function ConsultaTickets() {
  const [rut, setRut] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [err, setErr] = useState("");
  const [tickets, setTickets] = useState<TicketConsulta[] | null>(null);

  async function buscar() {
    setErr("");
    setTickets(null);
    if (!isValidRut(rut)) {
      setErr("RUT inválido. Ej: 12.345.678-9");
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(`/api/empresa/tickets?rut=${encodeURIComponent(rut)}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo consultar");
        return;
      }
      setTickets(data.tickets);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="card">
      <h3>📋 Consulta el uso de tus tickets</h3>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 14 }}>
        Ingresa el RUT con el que compraste tu Pack Empresa y revisa qué tickets están disponibles, cuáles se usaron
        y en qué patente.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={rut}
          onChange={(e) => setRut(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="12.345.678-9"
          style={{ flex: "1 1 220px" }}
        />
        <button className="btn" style={{ marginTop: 0 }} onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando..." : "Consultar"}
        </button>
      </div>
      <div className="err">{err}</div>

      {tickets && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>N°</th>
                <th>Lote</th>
                <th>Estado</th>
                <th>Patente de uso</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">No encontramos tickets para ese RUT</div>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.codigo}>
                    <td className="plate-tag">{t.codigo}</td>
                    <td>
                      {t.numeroLote}/{t.totalLote}
                    </td>
                    <td>{t.nombreLote}</td>
                    <td>
                      <span className={`status-pill ${estadoClase(t.estado)}`}>{t.estado}</span>
                    </td>
                    <td>{t.patenteUso || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
