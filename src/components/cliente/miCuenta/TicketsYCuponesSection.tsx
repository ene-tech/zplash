"use client";

import { useState } from "react";
import type { VehiculoSesion } from "@/lib/sesionCliente";
import { AgregarCupon } from "./AgregarCupon";
import { PacksTicketsGestion } from "./PacksTicketsGestion";

// Lo que devuelve GET /api/cliente/mi-cuenta en `cupones` (ver
// cuponesDeLaCuenta ahí): ya viene con el estado y el beneficio resueltos, así
// que acá no se repite ninguna regla de negocio.
export interface CuponCuenta {
  codigo: string;
  nombreLote: string;
  numeroLote: number;
  totalLote: number;
  estado: string;
  beneficio: string;
  patente: string | null;
  fechaUso: string | null;
  fechaCaducidad: string;
  patentesAutorizadas: string[];
  /** Solo en un Pack de Tickets web de este correo: se gestiona en PacksTicketsGestion. */
  loteId: string | null;
}

function estadoClase(estado: string): "ok" | "warn" | "bad" {
  if (estado === "Usado") return "ok";
  if (estado === "Caducado") return "bad";
  return "warn";
}

// Tickets de un Pack Empresa comprado por web (ver FormularioCompraTickets en
// TicketsCard, dentro de Tipo de Lavados) y cupones que el cliente sumó a mano
// con AgregarCupon — todos atados a la cuenta por el correo de la sesión, sin
// depender de que el login con Google esté conectado de verdad.
export function TicketsYCuponesSection({
  cupones,
  vehiculos,
  onAgregado,
}: {
  cupones: CuponCuenta[];
  vehiculos: VehiculoSesion[];
  onAgregado: () => void;
}) {
  const [eliminando, setEliminando] = useState("");
  const sueltos = cupones.filter((c) => !c.loteId);

  // Solo caducados: ver /api/cliente/mi-cuenta/ocultar-cupon.
  async function eliminar(codigo: string) {
    if (!window.confirm(`¿Eliminar el ticket ${codigo} de tu cuenta?`)) return;
    setEliminando(codigo);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/ocultar-cupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      if (!res.ok) window.alert((await res.json().catch(() => null))?.error || "No se pudo eliminar");
      else onAgregado();
    } catch {
      window.alert("Sin conexión. Intenta de nuevo.");
    }
    setEliminando("");
  }

  return (
    <>
      <PacksTicketsGestion cupones={cupones} vehiculos={vehiculos} onCambio={onAgregado} />
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Mis tickets y cupones</h3>
          <AgregarCupon vehiculos={vehiculos} onAgregado={onAgregado} />
        </div>
        {sueltos.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Beneficio</th>
                  <th>Lote</th>
                  <th>Estado</th>
                  <th>Patente</th>
                  <th>Fecha de uso</th>
                </tr>
              </thead>
              <tbody>
                {sueltos.map((c) => (
                  <tr key={c.codigo}>
                    <td className="plate-tag">{c.codigo}</td>
                    <td>{c.beneficio}</td>
                    <td>
                      {c.nombreLote}
                      {/* El N° solo dice algo en un lote de varios tickets: un
                          descuento suelto siempre sería "1/1". */}
                      {c.totalLote > 1 && (
                        <div style={{ color: "var(--gray)", fontSize: 12 }}>
                          N° {c.numeroLote}/{c.totalLote}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${estadoClase(c.estado)}`}>{c.estado}</span>
                      {c.estado === "Caducado" && (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
                          onClick={() => eliminar(c.codigo)}
                          disabled={eliminando === c.codigo}
                          aria-label={`Eliminar ticket ${c.codigo}`}
                        >
                          {eliminando === c.codigo ? "..." : "Eliminar"}
                        </button>
                      )}
                    </td>
                    <td>{c.patente || "-"}</td>
                    <td>{c.fechaUso ? new Date(c.fechaUso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="card" style={{ color: "var(--gray)", fontSize: 14, margin: 0 }}>
            {cupones.length ? "No tienes otros tickets ni cupones" : "No tienes tickets ni cupones"} — usa &quot;+ Agregar
            cupón o ticket&quot; si recibiste un código.
          </p>
        )}
      </div>
    </>
  );
}
