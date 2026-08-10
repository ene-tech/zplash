"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtCLP, fmtDate, fmtFecha } from "@/lib/helpers";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import { TicketsEmpresaSection } from "@/components/cliente/miCuenta/TicketsEmpresaSection";
import { SolicitudCambioPatente } from "@/components/cliente/miCuenta/SolicitudCambioPatente";
import { QuitarVehiculo } from "@/components/cliente/miCuenta/QuitarVehiculo";
import { OtpLoginForm } from "@/components/cliente/miCuenta/OtpLoginForm";
import { ActivarNotificaciones } from "@/components/cliente/miCuenta/ActivarNotificaciones";
import { RenovacionLegacyCard } from "@/components/cliente/miCuenta/RenovacionLegacyCard";
import { AgregarTarjeta } from "@/components/cliente/miCuenta/AgregarTarjeta";
import { EliminarTarjeta } from "@/components/cliente/miCuenta/EliminarTarjeta";

interface Tarjeta {
  patente: string;
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
  estado: string;
  proximoCobro: string | null;
}
interface RenovacionLegacy {
  patente: string;
  desde: string;
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

function CuentaBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
      <span style={{ fontSize: 13 }}>{email}</span>
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
  const [renovacionesLegacy, setRenovacionesLegacy] = useState<RenovacionLegacy[]>([]);

  const cargarMiCuenta = useCallback(() => {
    fetch("/api/cliente/mi-cuenta")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tarjetas: Tarjeta[]; detailing: Detailing[]; compras: Compra[]; renovacionesLegacy: RenovacionLegacy[] } | null) => {
        if (!data) return;
        setTarjetas(data.tarjetas);
        setDetailing(data.detailing);
        setCompras(data.compras);
        setRenovacionesLegacy(data.renovacionesLegacy || []);
      });
  }, []);

  useEffect(() => {
    if (!sesion) return;
    cargarMiCuenta();
  }, [sesion, cargarMiCuenta]);

  if (cargando) return null;

  if (!sesion) {
    return <OtpLoginForm onSuccess={refrescar} />;
  }

  return (
    <div>
      <CuentaBar email={sesion.email} onLogout={cerrar} />
      <ActivarNotificaciones />
      <TicketsEmpresaSection key={sesion.email} email={sesion.email} />

      <h3 style={{ marginBottom: 12 }}>Mis vehículos</h3>
      {sesion.vehiculos.length > 0 ? (
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
              {v.plan !== "Sin plan" && (
                <SolicitudCambioPatente
                  patente={v.patente}
                  plan={v.plan}
                  vencimiento={v.vencimiento}
                  patentePendiente={v.patentePendiente}
                  patentePendienteDesde={v.patentePendienteDesde}
                  onActualizado={refrescar}
                />
              )}
              <QuitarVehiculo patente={v.patente} onQuitado={refrescar} />
            </div>
          ))}
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
          No tienes vehículos en tu cuenta.
        </p>
      )}

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Tarjetas registradas</h3>
        <AgregarTarjeta vehiculos={sesion.vehiculos} emailDefault={sesion.email} />
      </div>
      {tarjetas.length > 0 || renovacionesLegacy.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {tarjetas.map((t) => (
            <div className="vehicle-card" key={t.patente}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="plate-tag">{t.patente}</span>
                <span className={`status-pill ${t.estado === "activa" ? "ok" : "warn"}`}>
                  {t.estado === "suspendida" ? "Suspendida" : t.proximoCobro ? "Renovación automática activa" : "Activa"}
                </span>
              </div>
              <div className="plan-nombre">
                {t.cardTipo} terminada en {t.cardUltimosDigitos}
              </div>
              <EliminarTarjeta patente={t.patente} onEliminada={cargarMiCuenta} />
            </div>
          ))}
          {renovacionesLegacy.map((r) => (
            <RenovacionLegacyCard key={r.patente} patente={r.patente} desde={r.desde} />
          ))}
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, marginBottom: 26 }}>
          No tienes tarjetas registradas — usa &quot;+ Agregar tarjeta&quot; arriba para guardar una.
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
