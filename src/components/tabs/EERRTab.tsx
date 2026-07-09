"use client";

import { Fragment, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { CATEGORIA_GASTO_A_GRUPO, fmtCLP, GASTO_GRUPOS, mesActualKey, mesKey } from "@/lib/helpers";

function Fila({
  label,
  valor,
  nivel = 0,
  bold = false,
  destacado = false,
}: {
  label: string;
  valor: number;
  nivel?: number;
  bold?: boolean;
  destacado?: boolean;
}) {
  return (
    <tr style={destacado ? { background: "var(--bg-card)" } : undefined}>
      <td style={{ paddingLeft: 12 + nivel * 20, fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td
        style={{
          textAlign: "right",
          fontWeight: bold ? 700 : 400,
          color: valor < 0 ? "var(--red)" : valor > 0 ? "var(--green)" : undefined,
        }}
      >
        {fmtCLP(valor)}
      </td>
    </tr>
  );
}

export default function EERRTab() {
  const { data } = useApp();
  const [mes, setMes] = useState(mesActualKey);

  const { ingresosExplotacion, totalesPorCategoria, totalesPorGrupo } = useMemo(() => {
    const ingresos = data.movimientosContables.filter((m) => m.tipo === "ingreso" && mesKey(m.fecha) === mes);
    const egresos = data.movimientosContables.filter((m) => m.tipo === "egreso" && mesKey(m.fecha) === mes);

    const totalesPorCategoria: Record<string, number> = {};
    const totalesPorGrupo: Record<string, number> = {};
    for (const g of GASTO_GRUPOS) totalesPorGrupo[g.grupo] = 0;

    for (const m of egresos) {
      const categoria = m.categoria || "Otros Gastos Directos";
      const grupo = CATEGORIA_GASTO_A_GRUPO[categoria] || "Otros Costos Directos";
      totalesPorCategoria[categoria] = (totalesPorCategoria[categoria] || 0) + m.monto;
      totalesPorGrupo[grupo] = (totalesPorGrupo[grupo] || 0) + m.monto;
    }

    const ingresosExplotacion = ingresos.reduce((s, m) => s + m.monto, 0);

    return { ingresosExplotacion, totalesPorCategoria, totalesPorGrupo };
  }, [data.movimientosContables, mes]);

  const otrosCostosDirectos = totalesPorGrupo["Otros Costos Directos"] || 0;
  const remuneraciones = totalesPorGrupo["Gasto de Remuneraciones"] || 0;
  const administracion = totalesPorGrupo["Gastos de Administración"] || 0;
  const financierosBancarios = totalesPorGrupo["Gastos Financieros Bancarios"] || 0;
  const otrosEgresosFuera = totalesPorGrupo["Otros Egresos Fuera de la Explotación"] || 0;
  const otrosIngresosFuera = 0; // sin clasificación de ingresos no operacionales por ahora

  const resultadoOperacional = ingresosExplotacion - otrosCostosDirectos - remuneraciones - administracion;
  const resultadoNoOperacional = otrosIngresosFuera - financierosBancarios - otrosEgresosFuera;
  const total = resultadoOperacional + resultadoNoOperacional;

  const grupoOperacional = GASTO_GRUPOS.filter((g) => g.seccion === "operacional");
  const grupoNoOperacional = GASTO_GRUPOS.filter((g) => g.seccion === "no_operacional");

  const nombreMes = new Date(mes + "-01T12:00:00").toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="toolbar">
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--gray)", fontSize: 13 }}>Periodo</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, margin: "0 0 14px" }}>
        Se calcula a partir de los movimientos registrados en Ingresos y Egresos/Gastos para {nombreMes}. Los ingresos no
        operacionales (venta de activos fijos, etc.) aún no tienen un formulario propio, por lo que se muestran en $0.
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th style={{ textAlign: "right", textTransform: "capitalize" }}>{nombreMes}</th>
            </tr>
          </thead>
          <tbody>
            <Fila label="Resultado Operacional" valor={resultadoOperacional} bold destacado />

            <Fila label="Ingresos de Explotación" valor={ingresosExplotacion} nivel={1} bold destacado />
            <Fila label="Ingresos por Ventas de Productos" valor={ingresosExplotacion} nivel={2} />

            {grupoOperacional.map((g) => (
              <Fragment key={g.grupo}>
                <Fila label={g.grupo} valor={-(totalesPorGrupo[g.grupo] || 0)} nivel={1} bold destacado />
                {g.categorias.map((c) => (
                  <Fila key={c} label={c} valor={-(totalesPorCategoria[c] || 0)} nivel={2} />
                ))}
              </Fragment>
            ))}

            <Fila label="Resultado No Operacional" valor={resultadoNoOperacional} bold destacado />

            <Fila label="Otros Ingresos Fuera de la Explotación" valor={otrosIngresosFuera} nivel={1} bold destacado />
            <Fila label="Venta de Activos Fijos" valor={otrosIngresosFuera} nivel={2} />

            {grupoNoOperacional.map((g) => (
              <Fragment key={g.grupo}>
                <Fila label={g.grupo} valor={-(totalesPorGrupo[g.grupo] || 0)} nivel={1} bold destacado />
                {g.categorias.map((c) => (
                  <Fila key={c} label={c} valor={-(totalesPorCategoria[c] || 0)} nivel={2} />
                ))}
              </Fragment>
            ))}

            <Fila label="TOTAL ESTADO DE RESULTADOS" valor={total} bold destacado />
          </tbody>
        </table>
      </div>
    </div>
  );
}
