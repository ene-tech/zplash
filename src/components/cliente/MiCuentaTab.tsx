"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtCLP, fmtDate, fmtFecha } from "@/lib/helpers";
import type { OfertaPlan } from "@/lib/helpers";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import { TicketsEmpresaSection } from "@/components/cliente/miCuenta/TicketsEmpresaSection";
import { VehiculoCard } from "@/components/cliente/miCuenta/VehiculoCard";
import { AgregarPatente } from "@/components/cliente/miCuenta/AgregarPatente";
import { OtpLoginForm } from "@/components/cliente/miCuenta/OtpLoginForm";
import { ActivarNotificaciones } from "@/components/cliente/miCuenta/ActivarNotificaciones";
import { RenovacionLegacyCard } from "@/components/cliente/miCuenta/RenovacionLegacyCard";
import { AgregarTarjeta } from "@/components/cliente/miCuenta/AgregarTarjeta";
import { EliminarTarjeta } from "@/components/cliente/miCuenta/EliminarTarjeta";
import { DatosFacturacionSection } from "@/components/cliente/miCuenta/DatosFacturacionSection";
import { AvisoPoliticas } from "@/components/cliente/miCuenta/AvisoPoliticas";
import { PromoModal } from "@/components/cliente/miCuenta/PromoModal";

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
  const [ofertas, setOfertas] = useState<Record<string, OfertaPlan>>({});
  // undefined = todavía no llega la respuesta de /api/cliente/mi-cuenta. Sin
  // ese tercer estado el aviso de políticas parpadea en cada carga para quien
  // ya aceptó.
  const [politicasAceptadas, setPoliticasAceptadas] = useState<boolean | undefined>(undefined);

  const cargarMiCuenta = useCallback(() => {
    fetch("/api/cliente/mi-cuenta")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tarjetas: Tarjeta[];
            detailing: Detailing[];
            compras: Compra[];
            renovacionesLegacy: RenovacionLegacy[];
            ofertas: Record<string, OfertaPlan>;
            politicasAceptadas: boolean;
          } | null
        ) => {
          if (!data) return;
          setTarjetas(data.tarjetas);
          setDetailing(data.detailing);
          setCompras(data.compras);
          setRenovacionesLegacy(data.renovacionesLegacy || []);
          setOfertas(data.ofertas || {});
          setPoliticasAceptadas(data.politicasAceptadas);
        }
      );
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
      <PromoModal />
      <CuentaBar email={sesion.email} onLogout={cerrar} />
      {politicasAceptadas === false && <AvisoPoliticas onAceptado={() => setPoliticasAceptadas(true)} />}
      <ActivarNotificaciones />
      <TicketsEmpresaSection key={sesion.email} email={sesion.email} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Mis vehículos</h3>
        <AgregarPatente onAgregado={refrescar} />
      </div>
      {sesion.vehiculos.length > 0 ? (
        // minmax más ancho que el .card-grid genérico: la cabecera de VehiculoCard
        // ahora lleva patente + plan + estado en una sola línea, y con columnas de
        // 260px ese texto se trunca demasiado agresivo en pantallas medianas/anchas.
        <div className="card-grid" style={{ marginBottom: 26, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {sesion.vehiculos.map((v) => {
            // Solo "activa" es cobrable directo (ver cobrarOfertaOneclick): una
            // tarjeta "suspendida" sigue guardada pero el cron tampoco la cobra.
            const tarjetaActiva = tarjetas.find((t) => t.patente === v.patente && t.estado === "activa");
            return (
              <VehiculoCard
                key={v.patente}
                v={v}
                oferta={ofertas[v.patente]}
                tarjeta={tarjetaActiva ? { cardTipo: tarjetaActiva.cardTipo, cardUltimosDigitos: tarjetaActiva.cardUltimosDigitos } : undefined}
                email={sesion.email}
                onActualizado={refrescar}
              />
            );
          })}
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

      <DatosFacturacionSection vehiculos={sesion.vehiculos} onActualizado={refrescar} />

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

      {/* El aviso de arriba desaparece al aceptar, pero el texto tiene que
          seguir a mano: este enlace queda siempre. */}
      <p style={{ marginTop: 26, fontSize: 13, color: "var(--gray)" }}>
        <a href="/politicas" target="_blank" rel="noopener noreferrer">
          Políticas de Funcionamiento y Garantía
        </a>
      </p>
    </div>
  );
}
