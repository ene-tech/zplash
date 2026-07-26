"use client";

import { useEffect, useState } from "react";

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

// A diferencia del resto de MiCuentaTab (vehículos/tarjetas/detailing, ver
// *_DEMO ahí), esta sección SÍ es real: busca en /api/empresa/tickets por el
// email de la sesión — funciona apenas alguien compra un Pack Empresa con
// ese correo (ver FormularioCompra en VentaEmpresaInfoTab), sin depender de
// que el login con Google esté conectado de verdad.
// Se instancia con key={email} en los call sites para que un cambio de
// correo remonte el componente en vez de reutilizar el estado — así
// `cargando` arranca en `true` sin necesidad de resetearlo desde el efecto.
export function TicketsEmpresaSection({ email }: { email: string }) {
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
