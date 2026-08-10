"use client";

import { useEffect, useState } from "react";
import { fmtCLP, fmtDate, fmtFecha } from "@/lib/helpers";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import { TicketsEmpresaSection } from "@/components/cliente/miCuenta/TicketsEmpresaSection";
import { SolicitudCambioPatente } from "@/components/cliente/miCuenta/SolicitudCambioPatente";
import { OtpLoginForm } from "@/components/cliente/miCuenta/OtpLoginForm";
import { ActivarNotificaciones } from "@/components/cliente/miCuenta/ActivarNotificaciones";

interface Tarjeta {
  patente: string;
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
  estado: string;
}
interface Detailing {
  id: string;
  patente: string;
  fechaHora: string;
  estado: string;
  servicios: string[];
}
interface Compra {
  fecha: string;
  tipo: string;
  monto: number;
  patente: string;
}

function CuentaBar({ telefono, onLogout }: { telefono: string; onLogout: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
      <span style={{ fontSize: 13 }}>{telefono}</span>
      <button type="button" className="logout-btn" onClick={onLogout}>
        Cerrar sesión
      </button>
    </div>
  );
}

export default function MiCuentaTab() {
  const { sesion, cargando, refrescar, cerrar } = useSesionCliente();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [detailing, setDetailing] = useState<Detailing[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);

  useEffect(() => {
    if (!sesion) return;
    fetch("/api/cliente/mi-cuenta")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tarjetas: Tarjeta[]; detailing: Detailing[]; compras: Compra[] } | null) => {
        if (!data) return;
        setTarjetas(data.tarjetas);
        setDetailing(data.detailing);
        setCompras(data.compras);
      });
  }, [sesion]);

  if (cargando) return null;

  if (!sesion) {
    return <OtpLoginForm onSuccess={refrescar} />;
  }

  return (
    <div>
      <CuentaBar telefono={sesion.telefono} onLogout={cerrar} />
      <ActivarNotificaciones />
      {sesion.email && <TicketsEmpresaSection key={sesion.email} email={sesion.email} />}

      <h3 style={{ marginBottom: 12 }}>Mis vehículos</h3>
      <div className="card-grid" style={{ marginBottom: 26 }}>
        {sesion.vehiculos.map((v) => (
          <div className="vehicle-card" key={v.patente}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="plate-tag">{v.patente}</span>
              <span className={`status-pill ${v.estado.cls}`}>{v.estado.label}</span>
            </div>
            <div className="plan-nombre">{v.plan}</div>
            {v.vencimiento && (
              <div style={{ color: "var(--gray)", fontSize: 12.5 }}>Vence el {fmtFecha(v.vencimiento)}</div>
            )}
            {v.plan !== "Sin plan" && <SolicitudCambioPatente patente={v.patente} plan={v.plan} vencimiento={v.vencimiento} />}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Servicios de Detailing agendados</h3>
        <a href="/cliente/detailing" className="btn" style={{ textDecoration: "none" }}>
          Agenda un Servicio de Detailing
        </a>
      </div>
      {detailing.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {detailing.map((d) => (
            <div className="vehicle-card" key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="plate-tag">{d.patente}</span>
                <span className={`status-pill ${d.estado === "agendado" ? "warn" : d.estado === "completado" ? "ok" : "bad"}`}>
                  {d.estado === "agendado" ? "Agendado" : d.estado === "completado" ? "Completado" : "Cancelado"}
                </span>
              </div>
              <div className="plan-nombre">{d.servicios.join(", ")}</div>
              <div style={{ color: "var(--gray)", fontSize: 12.5 }}>{fmtDate(d.fechaHora)}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
          No tienes servicios de Detailing agendados.
        </p>
      )}

      <h3 style={{ marginBottom: 12 }}>Tarjetas registradas</h3>
      {tarjetas.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {tarjetas.map((t) => (
            <div className="vehicle-card" key={t.patente}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="plate-tag">{t.patente}</span>
                <span className={`status-pill ${t.estado === "activa" ? "ok" : "bad"}`}>
                  {t.estado === "activa" ? "Renovación automática activa" : "Cancelada"}
                </span>
              </div>
              <div className="plan-nombre">
                {t.cardTipo} terminada en {t.cardUltimosDigitos}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
          No tienes tarjetas registradas. Puedes inscribir una desde{" "}
          <a href="/pagar" style={{ color: "var(--gold)" }}>
            Pagar / Renovar plan
          </a>{" "}
          para activar la renovación automática.
        </p>
      )}

      <h3 style={{ marginBottom: 12 }}>Historial de compras</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Detalle</th>
              <th>Patente</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c, i) => (
              <tr key={i}>
                <td>{fmtFecha(c.fecha)}</td>
                <td>{c.tipo}</td>
                <td>{c.patente || "—"}</td>
                <td>{fmtCLP(c.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
