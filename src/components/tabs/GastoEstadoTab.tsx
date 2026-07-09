"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, mesActualKey, mesKey } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";

const ESTADO_LABEL: Record<string, string> = {
  pagado_cc: "Pagado desde CC",
  x_rendir: "X Rendir",
  pendiente_pago: "Pendiente de Pago",
};

export default function GastoEstadoTab({
  estado,
  titulo,
}: {
  estado: "x_rendir" | "pendiente_pago";
  titulo: string;
}) {
  const { data, commit } = useApp();
  const [mes, setMes] = useState(mesActualKey);
  const [busqueda, setBusqueda] = useState("");

  const items = useMemo(
    () =>
      data.movimientosContables
        .filter((m) => m.tipo === "egreso" && m.estado === estado && mesKey(m.fecha) === mes)
        .filter((m) => {
          const q = busqueda.toLowerCase().trim();
          if (!q) return true;
          return (
            m.descripcion.toLowerCase().includes(q) ||
            (m.categoria || "").toLowerCase().includes(q) ||
            (m.contraparte || "").toLowerCase().includes(q) ||
            (m.numeroFactura || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [data.movimientosContables, estado, mes, busqueda]
  );

  const total = items.reduce((s, m) => s + m.monto, 0);

  const cambiarEstado = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado } : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>{titulo}</h3>
        <div className="field">
          <label>Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="num">{fmtCLP(total)}</div>
            <div className="lbl">Total {ESTADO_LABEL[estado].toLowerCase()}</div>
          </div>
          <div className="stat-card">
            <div className="num">{items.length}</div>
            <div className="lbl">Documentos</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, tipo de gasto, proveedor o N° factura..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Tipo de gasto</th>
              <th>RUT</th>
              <th>Proveedor</th>
              <th>N° Factura</th>
              <th>Documento</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty">Sin registros para este periodo</div>
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.fecha).toLocaleDateString("es-CL")}</td>
                  <td>{m.descripcion}</td>
                  <td>{m.categoria || "-"}</td>
                  <td>{m.rutProveedor || "-"}</td>
                  <td>{m.contraparte || "-"}</td>
                  <td>{m.numeroFactura || "-"}</td>
                  <td>{m.tipoDocumento || "-"}</td>
                  <td>{fmtCLP(m.monto)}</td>
                  <td className="row-actions">
                    <select value={m.estado} onChange={(e) => cambiarEstado(m, e.target.value as MovimientoContable["estado"])}>
                      <option value="pagado_cc">Pagado desde CC</option>
                      <option value="x_rendir">X Rendir</option>
                      <option value="pendiente_pago">Pendiente de Pago</option>
                    </select>
                    <button className="icon-btn" onClick={() => eliminar(m)}>
                      Eliminar
                    </button>
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
