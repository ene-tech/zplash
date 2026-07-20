"use client";

import { useEffect, useState } from "react";
import { fmtCLP, fmtDate, fmtFecha, isValidPatente, normPlate, PATENTE_FORMATO_MSG } from "@/lib/helpers";
import GoogleIcon from "@/components/GoogleIcon";
import { useSesionCliente } from "@/hooks/useSesionCliente";
import type { VehiculoSesion } from "@/lib/sesionCliente";

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
const TARJETAS_DEMO = [
  { patente: "AB1234", cardTipo: "Visa", cardUltimosDigitos: "4321", estado: "activa" as const },
];

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

interface TicketEmpresa {
  codigo: string;
  nombreLote: string;
  numeroLote: number;
  totalLote: number;
  estado: string;
  patenteUso: string | null;
}

function estadoClase(estado: string): "ok" | "warn" | "bad" {
  if (estado === "Usado") return "ok";
  if (estado === "Caducado") return "bad";
  return "warn";
}

// A diferencia del resto de esta pantalla (vehículos/tarjetas/detailing, ver
// *_DEMO más arriba), esta sección SÍ es real: busca en /api/empresa/tickets
// por el email de la sesión — funciona apenas alguien compra un Pack Empresa
// con ese correo (ver FormularioCompra en VentaEmpresaInfoTab), sin depender
// de que el login con Google esté conectado de verdad.
// Se instancia con key={email} en los call sites para que un cambio de
// correo remonte el componente en vez de reutilizar el estado — así
// `cargando` arranca en `true` sin necesidad de resetearlo desde el efecto.
function TicketsEmpresaSection({ email }: { email: string }) {
  const [cargando, setCargando] = useState(true);
  const [tickets, setTickets] = useState<TicketEmpresa[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/empresa/tickets?email=${encodeURIComponent(email)}`)
      .then((res) => (res.ok ? res.json() : { tickets: [] }))
      .then((data) => {
        if (!cancelado) setTickets(data.tickets || []);
      })
      .catch(() => {
        if (!cancelado) setTickets([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [email]);

  if (cargando) return null;
  if (!tickets || tickets.length === 0) return null;

  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{ marginBottom: 12 }}>Tickets de empresa</h3>
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
            {tickets.map((t) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Solo aplica a vehículos con un plan mensual vigente: el cambio de patente
// no es inmediato porque el plan ya está pagado/activo para el mes en curso
// bajo la patente actual — se hace efectivo recién cuando ese mes termina y
// empieza el siguiente. Por ahora esto solo queda visible en la pantalla
// (no hay backend detrás del login todavía, ver MiCuentaTab).
function SolicitudCambioPatente({ patente, plan, vencimiento }: { patente: string; plan: string; vencimiento: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [solicitada, setSolicitada] = useState<string | null>(null);

  if (solicitada) {
    return (
      <p style={{ color: "var(--gray)", fontSize: 12.5, marginTop: 8 }}>
        Solicitaste cambiar tu patente a <strong>{solicitada}</strong>. El cambio se aplicará
        automáticamente a tu plan cuando termine tu mes actual{vencimiento ? ` (vence el ${fmtFecha(vencimiento)})` : ""} e
        inicie el próximo — hasta esa fecha tu plan sigue funcionando con la patente {patente}.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 8, padding: "6px 10px", fontSize: 12.5 }}
        onClick={() => setAbierto(true)}
      >
        Solicitar cambio de patente
      </button>
    );
  }

  const pedirConfirmacion = () => {
    if (!isValidPatente(nueva)) {
      setError(PATENTE_FORMATO_MSG);
      return;
    }
    if (normPlate(nueva) === normPlate(patente)) {
      setError("Esa ya es tu patente actual.");
      return;
    }
    setConfirmando(true);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="field" style={{ marginBottom: 6 }}>
        <input
          value={nueva}
          onChange={(e) => {
            setNueva(e.target.value.toUpperCase());
            setError("");
          }}
          placeholder="Nueva patente (ej. AB1234)"
          maxLength={6}
          style={{ textTransform: "uppercase" }}
        />
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn" style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }} onClick={pedirConfirmacion}>
          Confirmar
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "6px 10px", fontSize: 12.5 }}
          onClick={() => {
            setAbierto(false);
            setNueva("");
            setError("");
          }}
        >
          Cancelar
        </button>
      </div>

      {confirmando && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3>Confirmar cambio de patente</h3>
            <div style={{ color: "var(--white)", fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
              ¿Estás seguro que deseas cambiar tu <strong>{plan}</strong> de tu vehículo patente{" "}
              <strong>{patente}</strong> a tu patente <strong>{normPlate(nueva)}</strong>?
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSolicitada(normPlate(nueva));
                  setConfirmando(false);
                  setAbierto(false);
                }}
              >
                Sí, cambiar patente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
