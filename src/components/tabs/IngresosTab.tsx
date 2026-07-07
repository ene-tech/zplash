"use client";

import { useApp } from "@/context/AppContext";
import { fmtFecha, fmtHora, normPlate } from "@/lib/helpers";

export default function IngresosTab() {
  const { data, ui, patchUi } = useApp();
  const filtered = !ui.search
    ? data.ingresos
    : data.ingresos.filter(
        (i) =>
          i.nombre.toLowerCase().includes(ui.search.toLowerCase()) ||
          normPlate(i.patente).includes(normPlate(ui.search))
      );

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre o patente..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Operador</th>
            <th>Garantía</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="empty">Sin registros</div>
              </td>
            </tr>
          ) : (
            filtered.map((i) => (
              <tr key={i.id}>
                <td>{fmtFecha(i.fecha)}</td>
                <td>{fmtHora(i.fecha)}</td>
                <td className="plate-tag">{i.patente}</td>
                <td>{i.nombre}</td>
                <td>{i.operador || "-"}</td>
                <td>{i.esGarantia ? "Sí" : "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
