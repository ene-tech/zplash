"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ESTADOS_CITA, esEstadoFinal, esRetrocesoInvalido } from "@/lib/agenda";
import { fmtTelefono, sumarDias, todayYMD } from "@/lib/helpers";
import type { Cita } from "@/types";

// Vista de día (igual estructura que la Agenda de ConsultaPro: navegar
// día a día en vez de un calendario semanal completo). Cada cita lista los
// servicios ligados vía cita_servicios (equivalente a cita_procedimientos),
// no un nombre único.
export function CitasDelDia() {
  const { data, commit } = useApp();
  const [fecha, setFecha] = useState(todayYMD());

  const nombresServicios = (ids: string[]) => {
    const nombres = ids.map((id) => data.servicios.find((s) => s.id === id)?.nombre).filter(Boolean);
    return nombres.length ? nombres.join(", ") : "—";
  };

  const citasDelDia = data.citas
    .filter((c) => c.fechaHora.slice(0, 10) === fecha)
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime());

  const cambiarEstado = (cita: Cita, estado: Cita["estado"]) => {
    commit({ citas: data.citas.map((c) => (c.id === cita.id ? { ...c, estado } : c)) });
  };

  return (
    <div className="modal" style={{ maxWidth: 780, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFecha(sumarDias(fecha, -1))}>
          ← Día anterior
        </button>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ flex: "0 0 auto" }} />
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFecha(sumarDias(fecha, 1))}>
          Día siguiente →
        </button>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Servicios</th>
              <th>Cliente</th>
              <th>Contacto</th>
              <th>Origen</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {citasDelDia.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">Sin citas agendadas ese día</div>
                </td>
              </tr>
            ) : (
              citasDelDia.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.fechaHora).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{nombresServicios(c.servicioIds)}</td>
                  <td>
                    {c.nombre} <span className="plate-tag">{c.patente}</span>
                  </td>
                  <td>{c.telefono ? fmtTelefono(c.telefono) : "-"}</td>
                  <td>
                    <span className={`status-pill ${c.origen === "publico" ? "warn" : "ok"}`}>
                      {c.origen === "publico" ? "Público" : "Interno"}
                    </span>
                  </td>
                  <td>
                    <select
                      value={c.estado}
                      onChange={(e) => cambiarEstado(c, e.target.value as Cita["estado"])}
                      disabled={esEstadoFinal(c.estado)}
                    >
                      {ESTADOS_CITA.map((e) => (
                        <option key={e.valor} value={e.valor} disabled={esRetrocesoInvalido(c.estado, e.valor)}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
