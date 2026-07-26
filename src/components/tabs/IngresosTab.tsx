"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { eliminarIngreso } from "@/lib/actions";
import { fmtCLP, fmtFecha, fmtHora, inRange, normPlate, puedeBorrarIngreso, tipoIngreso, ventaLavadoUnicoDeIngreso } from "@/lib/helpers";
import type { Ingreso } from "@/types";

export default function IngresosTab() {
  const { data, ui, patchUi, commit } = useApp();
  const desde = ui.ingresosDesde;
  const hasta = ui.ingresosHasta;
  const puedeBorrar = puedeBorrarIngreso(ui.perfilActual?.nombre);
  const [err, setErr] = useState("");

  const borrarIngreso = (ingreso: Ingreso) => {
    const ventaPareja = ventaLavadoUnicoDeIngreso(data.ventas, ingreso);
    const avisoVenta = ventaPareja
      ? ` También se elimina la venta de Lavado único por ${fmtCLP(ventaPareja.precio)} cobrada junto con este ingreso, para que el cliente no siga apareciendo elegible para la promoción de upgrade a plan.`
      : "";
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el ingreso de ${ingreso.nombre} (${ingreso.patente}) del ${fmtFecha(ingreso.fecha)} ${fmtHora(ingreso.fecha)}? Esto también resta la visita que sumó al cliente.${avisoVenta} No se puede deshacer.`,
        confirmLabel: "Eliminar",
        danger: true,
        onConfirm: async () => {
          const ok = await commit(eliminarIngreso(data, ingreso));
          setErr(ok ? "" : "No se pudo eliminar el ingreso (sin conexión). Intenta de nuevo.");
        },
      },
    });
  };

  const filtered = data.ingresos
    .filter((i) => !desde || !hasta || inRange(i.fecha, desde, hasta))
    .filter(
      (i) =>
        !ui.search ||
        i.nombre.toLowerCase().includes(ui.search.toLowerCase()) ||
        normPlate(i.patente).includes(normPlate(ui.search))
    );

  const exportarExcel = () => {
    import("xlsx").then((XLSX) => {
      const filas = filtered.map((i) => {
        const tipo = tipoIngreso(i);
        return {
          Fecha: fmtFecha(i.fecha),
          Hora: fmtHora(i.fecha),
          Patente: i.patente,
          Cliente: i.nombre,
          Operador: i.creadoPor || "",
          "Tipo de ingreso": tipo.label,
          "Estado plan al ingreso": i.planEstadoAlIngreso,
          "Vía cupón": i.viaCupon ? "Sí" : "No",
          "Código cupón": i.cuponCodigo || "",
          Garantía: i.esGarantia ? "Sí" : "No",
          "ID cita": i.citaId || "",
          "ID cliente": i.clienteId,
          "ID ingreso": i.id,
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          filas.length
            ? filas
            : [
                {
                  Fecha: "",
                  Hora: "",
                  Patente: "",
                  Cliente: "",
                  Operador: "",
                  "Tipo de ingreso": "",
                  "Estado plan al ingreso": "",
                  "Vía cupón": "",
                  "Código cupón": "",
                  Garantía: "",
                  "ID cita": "",
                  "ID cliente": "",
                  "ID ingreso": "",
                },
              ]
        ),
        "Historial de Ingresos"
      );
      XLSX.writeFile(wb, "historial-de-ingresos.xlsx");
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre o patente..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input
            type="date"
            value={desde || ""}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ ingresosDesde: e.target.value || null })}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input
            type="date"
            value={hasta || ""}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ ingresosHasta: e.target.value || null })}
          />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => patchUi({ ingresosDesde: null, ingresosHasta: null })}
        >
          Limpiar fechas
        </button>
        <button className="btn" style={{ alignSelf: "flex-end" }} onClick={exportarExcel}>
          Exportar (Excel)
        </button>
      </div>
      {err && (
        <div className="err" style={{ marginBottom: 10 }}>
          {err}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Patente</th>
            <th>Cliente</th>
            <th>Operador</th>
            <th>Tipo de ingreso</th>
            {puedeBorrar && <th></th>}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={puedeBorrar ? 7 : 6}>
                <div className="empty">Sin registros</div>
              </td>
            </tr>
          ) : (
            filtered.map((i) => {
              const tipo = tipoIngreso(i);
              return (
                <tr key={i.id}>
                  <td>{fmtFecha(i.fecha)}</td>
                  <td>{fmtHora(i.fecha)}</td>
                  <td className="plate-tag">{i.patente}</td>
                  <td>{i.nombre}</td>
                  <td>{i.creadoPor || "-"}</td>
                  <td>
                    <span className={`status-pill ${tipo.cls}`}>{tipo.label}</span>
                  </td>
                  {puedeBorrar && (
                    <td>
                      <button className="icon-btn" onClick={() => borrarIngreso(i)}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
