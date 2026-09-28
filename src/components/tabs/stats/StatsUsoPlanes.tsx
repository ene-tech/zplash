"use client";

import { fmtFecha } from "@/lib/helpers";
import type { Cliente } from "@/types";

type Fila = { cliente: Cliente; cantidad: number };

export function StatsUsoPlanes({
  promedioVisitasPlan,
  clientesConPlanCantidad,
  filasDistribucion,
  top10,
  bottom10,
  perdiendoPlanWoo,
}: {
  promedioVisitasPlan: number;
  clientesConPlanCantidad: number;
  filasDistribucion: { cantidad: number; clientes: number; pct: string; pctPasadas: string }[];
  top10: Fila[];
  bottom10: Fila[];
  perdiendoPlanWoo: Fila[];
}) {
  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Uso de planes · período seleccionado</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{promedioVisitasPlan.toFixed(1)}</div>
          <div className="lbl">Promedio de pasadas por cliente con plan ({clientesConPlanCantidad} clientes)</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Distribución de pasadas · clientes con plan</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Cantidad de pasadas</th>
            <th>Clientes</th>
            <th>% sobre clientes con plan</th>
            <th>% sobre pasadas totales</th>
          </tr>
        </thead>
        <tbody>
          {filasDistribucion.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="empty">Sin clientes con plan</div>
              </td>
            </tr>
          ) : (
            filasDistribucion.map(({ cantidad, clientes, pct, pctPasadas }) => (
              <tr key={cantidad}>
                <td>{cantidad}</td>
                <td>{clientes}</td>
                <td>{pct}</td>
                <td>{pctPasadas}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Top 10 clientes que más han pasado</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Pasadas</th>
          </tr>
        </thead>
        <tbody>
          {top10.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <div className="empty">Sin ingresos en el período seleccionado</div>
              </td>
            </tr>
          ) : (
            top10.map(({ cliente, cantidad }) => (
              <tr key={cliente.id}>
                <td className="plate-tag">{cliente.patente}</td>
                <td>{cliente.nombre}</td>
                <td>{cantidad}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Top 10 clientes que menos han pasado</h3>
      <table>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Pasadas</th>
          </tr>
        </thead>
        <tbody>
          {bottom10.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <div className="empty">Sin ingresos en el período seleccionado</div>
              </td>
            </tr>
          ) : (
            bottom10.map(({ cliente, cantidad }) => (
              <tr key={cliente.id}>
                <td className="plate-tag">{cliente.patente}</td>
                <td>{cliente.nombre}</td>
                <td>{cantidad}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>
        Perdiendo el plan · WooCommerce con 7 o más pasadas en el ciclo ({perdiendoPlanWoo.length})
      </h3>
      <table>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Pasadas del ciclo</th>
            <th>Vence</th>
            <th>Cobro automático</th>
          </tr>
        </thead>
        <tbody>
          {perdiendoPlanWoo.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty">Ningún cliente de WooCommerce llega a 7 pasadas en su ciclo</div>
              </td>
            </tr>
          ) : (
            perdiendoPlanWoo.map(({ cliente, cantidad }) => (
              <tr key={cliente.id}>
                <td className="plate-tag">{cliente.patente}</td>
                <td>{cliente.nombre}</td>
                <td>{cantidad}</td>
                <td>{cliente.vencimiento ? fmtFecha(cliente.vencimiento) : "-"}</td>
                {/* La marca se limpia al cortar: si sigue puesta, WooCommerce todavía le cobra. */}
                <td>{cliente.renovacionAutoWooDesde ? "Corte pendiente" : "Cortado"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
