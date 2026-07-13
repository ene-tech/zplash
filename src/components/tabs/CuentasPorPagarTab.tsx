"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, formatRut, mesActualKey, mesKey } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";

const GRUPOS = [
  { estado: "x_rendir" as const, titulo: "X Rendir" },
  { estado: "pendiente_pago" as const, titulo: "Pendiente de Pago" },
];

function TablaGasto({
  items,
  cambiarEstado,
  eliminar,
}: {
  items: MovimientoContable[];
  cambiarEstado: (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => void;
  eliminar: (m: MovimientoContable) => void;
}) {
  return (
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
            <th>Adjunto</th>
            <th>Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="empty">Sin registros para este periodo</div>
              </td>
            </tr>
          ) : (
            items.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.fecha).toLocaleDateString("es-CL")}</td>
                <td>{m.descripcion}</td>
                <td>{m.categoria || "-"}</td>
                <td>{m.rutProveedor ? formatRut(m.rutProveedor) : "-"}</td>
                <td>{m.contraparte || "-"}</td>
                <td>{m.numeroFactura || "-"}</td>
                <td>{m.tipoDocumento || "-"}</td>
                <td>
                  {m.documentoUrl ? (
                    <a href={m.documentoUrl} target="_blank" rel="noopener noreferrer">
                      Ver
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
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
  );
}

export default function CuentasPorPagarTab() {
  const { data, commit } = useApp();
  const [mes, setMes] = useState(mesActualKey);
  const [busqueda, setBusqueda] = useState("");

  const porGrupo = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return GRUPOS.map((g) => {
      const items = data.movimientosContables
        .filter((m) => m.tipo === "egreso" && m.estado === g.estado && mesKey(m.fecha) === mes)
        .filter((m) => {
          if (!q) return true;
          return (
            m.descripcion.toLowerCase().includes(q) ||
            (m.categoria || "").toLowerCase().includes(q) ||
            (m.contraparte || "").toLowerCase().includes(q) ||
            (m.numeroFactura || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const total = items.reduce((s, m) => s + m.monto, 0);
      return { ...g, items, total };
    });
  }, [data.movimientosContables, mes, busqueda]);

  const totalGeneral = porGrupo.reduce((s, g) => s + g.total, 0);
  const documentosGeneral = porGrupo.reduce((s, g) => s + g.items.length, 0);

  const cambiarEstado = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado } : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>Cuentas por Pagar</h3>
        <div className="field">
          <label>Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="stat-grid">
          <div className="stat-card warn">
            <div className="num">{fmtCLP(totalGeneral)}</div>
            <div className="lbl">Total Cuentas por Pagar</div>
          </div>
          <div className="stat-card">
            <div className="num">{documentosGeneral}</div>
            <div className="lbl">Documentos</div>
          </div>
          {porGrupo.map((g) => (
            <div className="stat-card warn" key={g.estado}>
              <div className="num">{fmtCLP(g.total)}</div>
              <div className="lbl">{g.titulo}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, tipo de gasto, proveedor o N° factura..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {porGrupo.map((g) => (
        <div key={g.estado} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{g.titulo}</h3>
            <div style={{ color: "var(--gray)", fontSize: 13 }}>
              {g.items.length} documento{g.items.length === 1 ? "" : "s"} · {fmtCLP(g.total)}
            </div>
          </div>
          <TablaGasto items={g.items} cambiarEstado={cambiarEstado} eliminar={eliminar} />
        </div>
      ))}
    </div>
  );
}
