"use client";

import { useCallback, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { eliminarIngreso } from "@/lib/logic";
import { fmtCLP, fmtFecha, fmtHora, inRange, normPlate, puedeBorrarIngreso, tipoIngreso, ventaLavadoUnicoDeIngreso } from "@/lib/helpers";
import type { Ingreso } from "@/types";
import { IngresoRow } from "./ingresos/IngresoRow";

export default function IngresosTab() {
  const { data, ui, patchUi, commit, loadingHistorial } = useApp();
  const desde = ui.ingresosDesde;
  const hasta = ui.ingresosHasta;
  const search = ui.search || "";
  const puedeBorrar = puedeBorrarIngreso(ui.perfilActual?.nombre);
  const [err, setErr] = useState("");

  const borrarIngreso = useCallback(
    (ingreso: Ingreso) => {
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
    },
    [data, patchUi, commit]
  );

  // Sin memo, este filtro corría sobre las 4000+ filas de `data.ingresos` en
  // cada tecla del buscador (mismo problema que ClientesTab, ver
  // ./clientes/ClienteRow) — acá además se combina con IngresoRow memoizado
  // para que las filas que siguen calzando con el filtro no se vuelvan a
  // renderizar.
  const filtered = useMemo(
    () =>
      data.ingresos
        .filter((i) => !desde || !hasta || inRange(i.fecha, desde, hasta))
        .filter((i) => !search || i.nombre.toLowerCase().includes(search.toLowerCase()) || normPlate(i.patente).includes(normPlate(search))),
    [data.ingresos, desde, hasta, search]
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

  // data.ingresos llega en la oleada "historial" (ver AppContext) — se
  // gatea acá en vez de dejar la tabla vacía un instante. Ver diagnóstico de
  // performance 2026-08-10.
  if (loadingHistorial) {
    return <div className="empty">Cargando historial de ingresos…</div>;
  }

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
            filtered.map((i) => <IngresoRow key={i.id} ingreso={i} puedeBorrar={puedeBorrar} onBorrar={borrarIngreso} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
