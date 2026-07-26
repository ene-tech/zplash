"use client";

import { useState } from "react";
import { fmtCLP, fmtDate, fmtFecha } from "@/lib/helpers";
import GoogleIcon from "@/components/GoogleIcon";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import { TicketsEmpresaSection } from "@/components/cliente/miCuenta/TicketsEmpresaSection";
import { SolicitudCambioPatente } from "@/components/cliente/miCuenta/SolicitudCambioPatente";

// Diseño asume que la cuenta de Google se vincula a un cliente por
// coincidencia de email (clientes.email) — no todos los clientes tienen
// email cargado hoy (es un campo opcional), así que la maqueta también
// cubre el caso en que la cuenta de Google no calza con ningún registro.
const EMAIL_ENCONTRADO = "juan.perez@gmail.com";
const EMAIL_NO_ENCONTRADO = "otro.correo@gmail.com";
const WHATSAPP_URL = "https://wa.me/56939059611?text=" + encodeURIComponent("Hola, quiero vincular mi correo a mi cuenta ZPlash");

const VEHICULOS_DEMO: VehiculoSesion[] = [
  { patente: "AB1234", plan: "Plan Ilimitado Mensual", estado: { label: "Vigente", cls: "ok" as const }, vencimiento: "2026-08-02" },
  { patente: "CD5678", plan: "Sin plan", estado: { label: "Vencido", cls: "bad" as const }, vencimiento: null },
];

// Espejo de suscripcionesOneclick (@/db/schema): una tarjeta inscrita puede
// no existir para un vehículo sin renovación automática activada (CD5678).
const TARJETAS_DEMO = [{ patente: "AB1234", cardTipo: "Visa", cardUltimosDigitos: "4321", estado: "activa" as const }];

// Espejo de citas + citaServicios (@/db/schema): agenda de Detailing hecha
// por el cliente o cargada por un operador desde Servicios Adicionales.
const DETAILING_DEMO = [
  { id: "1", patente: "AB1234", fechaHora: "2026-07-25T11:00:00", servicios: ["Auto Pequeño", "Limpieza de Tapiz"], estado: "agendado" as const },
];

const COMPRAS_DEMO = [
  { fecha: "2026-07-10T10:15:00", tipo: "Renovación de plan", monto: 19990 },
  { fecha: "2026-06-28T16:40:00", tipo: "Limpieza de Tapiz", monto: 15000 },
  { fecha: "2026-06-10T09:05:00", tipo: "Lavado único", monto: 9990 },
];

function CuentaBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="demo-badge">Vista previa</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GoogleIcon />
          <span style={{ fontSize: 13 }}>{email}</span>
        </div>
      </div>
      <button type="button" className="logout-btn" onClick={onLogout}>
        Cerrar sesión
      </button>
    </div>
  );
}

export default function MiCuentaTab() {
  const { sesion, iniciar, cerrar } = useSesionCliente();
  const [conectando, setConectando] = useState(false);

  const conectar = (destino: "encontrado" | "no-encontrado") => {
    setConectando(true);
    setTimeout(() => {
      iniciar({
        paso: destino,
        email: destino === "encontrado" ? EMAIL_ENCONTRADO : EMAIL_NO_ENCONTRADO,
        vehiculos: destino === "encontrado" ? VEHICULOS_DEMO : [],
      });
      setConectando(false);
    }, 600);
  };

  if (!sesion) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <h3>Mi Cuenta</h3>
        <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
          Inicia sesión con tu cuenta de Google para ver tus compras y vehículos registrados. Buscamos tus datos
          por el correo asociado a esa cuenta.
        </p>
        <button type="button" className="google-btn" onClick={() => conectar("encontrado")} disabled={conectando}>
          <GoogleIcon />
          {conectando ? "Conectando con Google..." : "Iniciar sesión con Google"}
        </button>
        <p style={{ color: "var(--gray)", fontSize: 11.5, marginTop: 16 }}>
          El inicio de sesión con Google todavía no está conectado — este botón muestra una vista previa con datos
          de ejemplo.{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              conectar("no-encontrado");
            }}
            style={{ color: "var(--gold)" }}
          >
            Ver ejemplo si el correo no está registrado
          </a>
          .
        </p>
      </div>
    );
  }

  if (sesion.paso === "no-encontrado") {
    return (
      <div>
        <CuentaBar email={sesion.email} onLogout={cerrar} />
        <TicketsEmpresaSection key={sesion.email} email={sesion.email} />
        <div className="card" style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
          <h3>No encontramos tus datos</h3>
          <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 18 }}>
            No tenemos ningún vehículo registrado con el correo <strong>{sesion.email}</strong>. Si ya eres
            cliente pero con otro correo o solo con tu teléfono, escríbenos y lo vinculamos.
          </p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
            Vincular mi cuenta por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CuentaBar email={sesion.email} onLogout={cerrar} />
      <TicketsEmpresaSection key={sesion.email} email={sesion.email} />

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
      {DETAILING_DEMO.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {DETAILING_DEMO.map((d) => (
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
      {TARJETAS_DEMO.length > 0 ? (
        <div className="card-grid" style={{ marginBottom: 26 }}>
          {TARJETAS_DEMO.map((t) => (
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
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {COMPRAS_DEMO.map((c, i) => (
              <tr key={i}>
                <td>{fmtFecha(c.fecha)}</td>
                <td>{c.tipo}</td>
                <td>{fmtCLP(c.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
