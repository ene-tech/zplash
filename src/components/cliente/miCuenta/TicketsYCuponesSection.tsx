"use client";

import type { VehiculoSesion } from "@/lib/sesionCliente";
import { AgregarCupon } from "./AgregarCupon";

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
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Mis tickets y cupones</h3>
        <AgregarCupon vehiculos={vehiculos} onAgregado={onAgregado} />
      </div>
      {cupones.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Beneficio</th>
                <th>Lote</th>
                <th>Estado</th>
                <th>Patente</th>
              </tr>
            </thead>
            <tbody>
              {cupones.map((c) => (
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
                  </td>
                  <td>{c.patente || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card" style={{ color: "var(--gray)", fontSize: 14, margin: 0 }}>
          No tienes tickets ni cupones — usa &quot;+ Agregar cupón o ticket&quot; si recibiste un código.
        </p>
      )}
    </div>
  );
}
