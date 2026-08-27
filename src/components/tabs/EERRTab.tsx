"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import {
  categoriaAGrupo,
  fechaEfectiva,
  fmtCLP,
  GRUPOS_GASTO_EERR,
  mesActualKey,
  mesesEntre,
  mesKey,
  variacionPorcentual,
} from "@/lib/helpers";

function mesCorto(mes: string) {
  return new Date(mes + "-01T12:00:00").toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
}

function mesLargo(mes: string) {
  return new Date(mes + "-01T12:00:00").toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function Fila({
  label,
  valores,
  negativo = false,
  nivel = 0,
  bold = false,
  destacado = false,
  conVariacion = true,
}: {
  label: string;
  /** Montos del rango, en positivo. Las cuentas de gasto se muestran negadas (negativo). */
  valores: number[];
  negativo?: boolean;
  nivel?: number;
  bold?: boolean;
  destacado?: boolean;
  conVariacion?: boolean;
}) {
  const pct = variacionPorcentual(valores);
  // Un gasto que sube es malo; un ingreso o resultado que sube es bueno.
  const bueno = pct === null || pct === 0 ? null : negativo ? pct < 0 : pct > 0;

  return (
    <tr style={destacado ? { background: "var(--bg-card)" } : undefined}>
      <td style={{ paddingLeft: 12 + nivel * 20, fontWeight: bold ? 700 : 400, whiteSpace: "nowrap" }}>{label}</td>
      {valores.map((v, i) => {
        const valor = negativo ? -v : v;
        return (
          <td
            key={i}
            style={{
              textAlign: "right",
              whiteSpace: "nowrap",
              fontWeight: bold ? 700 : 400,
              color: valor < 0 ? "var(--red)" : valor > 0 ? "var(--green)" : undefined,
            }}
          >
            {fmtCLP(valor)}
          </td>
        );
      })}
      {conVariacion && (
        <td
          style={{
            textAlign: "right",
            whiteSpace: "nowrap",
            fontWeight: bold ? 700 : 400,
            borderLeft: "1px solid var(--border)",
            color: bueno === null ? "var(--gray)" : bueno ? "var(--green)" : "var(--red)",
          }}
        >
          {pct === null ? "—" : (pct > 0 ? "▲ " : pct < 0 ? "▼ " : "") + Math.abs(Math.round(pct)) + "%"}
        </td>
      )}
    </tr>
  );
}

/** Mismo cuadro de cuentas en dos bases, porque la única diferencia real
 * entre ambos informes es en qué mes cae cada monto:
 *  - devengado (EERR): el mes de la operación, esté cobrada o no.
 *  - caja (Flujo de Caja): el mes en que la plata se movió (ver
 *    fechaEfectiva). Lo devengado y todavía no cobrado/pagado no suma; va
 *    aparte, en las dos líneas informativas del pie. */
export default function EERRTab({ caja = false }: { caja?: boolean }) {
  const { data } = useAppData();
  const [hasta, setHasta] = useState(mesActualKey);
  const [desde, setDesde] = useState(() => mesesEntre("2000-01", mesActualKey()).slice(-6)[0]);

  const meses = useMemo(() => mesesEntre(desde, hasta), [desde, hasta]);
  const conVariacion = meses.length > 1;

  const porMes = useMemo(() => {
    type Mes = {
      ingresos: number;
      cat: Record<string, number>;
      grupo: Record<string, number>;
      porCobrar: number;
      porPagar: number;
    };
    const mapa: Record<string, Mes> = {};
    for (const m of meses) mapa[m] = { ingresos: 0, cat: {}, grupo: {}, porCobrar: 0, porPagar: 0 };

    for (const mov of data.movimientosContables) {
      if (mov.tipo !== "ingreso" && mov.tipo !== "egreso") continue;
      const movida = fechaEfectiva(mov);
      if (caja && !movida) {
        // Devengado en el periodo pero sin plata todavía (la venta a 60 días,
        // la factura por pagar): queda fuera del flujo y solo se informa.
        const p = mapa[mesKey(mov.fecha)];
        if (p) {
          if (mov.tipo === "ingreso") p.porCobrar += mov.monto;
          else p.porPagar += mov.monto;
        }
        continue;
      }
      const e = mapa[mesKey(caja ? movida! : mov.fecha)];
      if (!e) continue;
      if (mov.tipo === "ingreso") {
        e.ingresos += mov.monto;
      } else {
        const categoria = mov.categoria || "Otros Gastos Directos";
        const grupo = categoriaAGrupo(data.categoriasGasto, categoria);
        e.cat[categoria] = (e.cat[categoria] || 0) + mov.monto;
        e.grupo[grupo] = (e.grupo[grupo] || 0) + mov.monto;
      }
    }
    return mapa;
  }, [data.movimientosContables, data.categoriasGasto, meses, caja]);

  // Los ingresos se registran con IVA incluido (precio de venta al público); el
  // EERR reporta ingresos netos. El flujo de caja no: lo que entró a la cuenta
  // entró con IVA y así hay que verlo.
  const serieIngresos = meses.map((m) => (caja ? porMes[m].ingresos : porMes[m].ingresos / 1.19));
  const serieGrupo = (grupo: string) => meses.map((m) => porMes[m].grupo[grupo] || 0);
  const serieCategoria = (categoria: string) => meses.map((m) => porMes[m].cat[categoria] || 0);

  const otrosCostosDirectos = serieGrupo("Otros Costos Directos");
  const remuneraciones = serieGrupo("Gasto de Remuneraciones");
  const administracion = serieGrupo("Gastos de Administración");
  const financierosBancarios = serieGrupo("Gastos Financieros Bancarios");
  const otrosEgresosFuera = serieGrupo("Otros Egresos Fuera de la Explotación");
  const otrosIngresosFuera = meses.map(() => 0); // sin clasificación de ingresos no operacionales por ahora

  const resultadoOperacional = meses.map(
    (_, i) => serieIngresos[i] - otrosCostosDirectos[i] - remuneraciones[i] - administracion[i],
  );
  const resultadoNoOperacional = meses.map(
    (_, i) => otrosIngresosFuera[i] - financierosBancarios[i] - otrosEgresosFuera[i],
  );
  const total = meses.map((_, i) => resultadoOperacional[i] + resultadoNoOperacional[i]);

  const grupoOperacional = GRUPOS_GASTO_EERR.filter((g) => g.seccion === "operacional");
  const grupoNoOperacional = GRUPOS_GASTO_EERR.filter((g) => g.seccion === "no_operacional");
  const categoriasDeGrupo = (grupo: string) => data.categoriasGasto.filter((c) => c.grupo === grupo);

  const rango = conVariacion
    ? mesLargo(meses[0]) + " a " + mesLargo(meses[meses.length - 1])
    : mesLargo(meses[0]);

  return (
    <div>
      <div className="toolbar">
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--gray)", fontSize: 13 }}>Desde</span>
          <input type="month" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--gray)", fontSize: 13 }}>Hasta</span>
          <input type="month" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, margin: "0 0 14px" }}>
        Se calcula a partir de los movimientos registrados en Ingresos y Egresos/Gastos para {rango}.{" "}
        {caja
          ? "Cada monto cae en el mes en que la plata se movió de verdad, no en el de la operación: una venta a 60 días recién aparece acá cuando se cobra (y lo mismo un gasto, cuando se paga). Los montos van con IVA incluido, tal como entran o salen de la cuenta. Al pie se informa lo devengado del periodo que todavía no se mueve."
          : "Los ingresos de explotación se muestran netos de IVA (monto registrado / 1,19)."}{" "}
        Los ingresos no operacionales (venta de activos fijos, etc.) aún no tienen un formulario propio, por lo que se
        muestran en $0.
        {conVariacion
          ? ` La columna Variación compara ${mesCorto(meses[0])} con ${mesCorto(meses[meses.length - 1])}: verde = evolución favorable, rojo = requiere atención.`
          : ""}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              {meses.map((m) => (
                <th key={m} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {mesCorto(m)}
                </th>
              ))}
              {conVariacion && (
                <th style={{ textAlign: "right", whiteSpace: "nowrap", borderLeft: "1px solid var(--border)" }}>
                  Variación
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <Fila
              label={caja ? "Flujo Operacional" : "Resultado Operacional"}
              valores={resultadoOperacional}
              bold
              destacado
              conVariacion={conVariacion}
            />

            <Fila
              label={caja ? "Ingresos de Explotación Cobrados" : "Ingresos de Explotación"}
              valores={serieIngresos}
              nivel={1}
              bold
              destacado
              conVariacion={conVariacion}
            />
            <Fila
              label="Ingresos por Ventas de Productos"
              valores={serieIngresos}
              nivel={2}
              conVariacion={conVariacion}
            />

            {grupoOperacional.map((g) => (
              <Fragment key={g.grupo}>
                <Fila
                  label={g.grupo}
                  valores={serieGrupo(g.grupo)}
                  negativo
                  nivel={1}
                  bold
                  destacado
                  conVariacion={conVariacion}
                />
                {categoriasDeGrupo(g.grupo).map((c) => (
                  <Fila
                    key={c.id}
                    label={c.nombre}
                    valores={serieCategoria(c.nombre)}
                    negativo
                    nivel={2}
                    conVariacion={conVariacion}
                  />
                ))}
              </Fragment>
            ))}

            <Fila
              label={caja ? "Flujo No Operacional" : "Resultado No Operacional"}
              valores={resultadoNoOperacional}
              bold
              destacado
              conVariacion={conVariacion}
            />

            <Fila
              label="Otros Ingresos Fuera de la Explotación"
              valores={otrosIngresosFuera}
              nivel={1}
              bold
              destacado
              conVariacion={conVariacion}
            />
            <Fila label="Venta de Activos Fijos" valores={otrosIngresosFuera} nivel={2} conVariacion={conVariacion} />

            {grupoNoOperacional.map((g) => (
              <Fragment key={g.grupo}>
                <Fila
                  label={g.grupo}
                  valores={serieGrupo(g.grupo)}
                  negativo
                  nivel={1}
                  bold
                  destacado
                  conVariacion={conVariacion}
                />
                {categoriasDeGrupo(g.grupo).map((c) => (
                  <Fila
                    key={c.id}
                    label={c.nombre}
                    valores={serieCategoria(c.nombre)}
                    negativo
                    nivel={2}
                    conVariacion={conVariacion}
                  />
                ))}
              </Fragment>
            ))}

            <Fila
              label={caja ? "FLUJO NETO DEL PERIODO" : "TOTAL ESTADO DE RESULTADOS"}
              valores={total}
              bold
              destacado
              conVariacion={conVariacion}
            />

            {caja && (
              // Informativas: el puente entre este cuadro y el EERR. No suman
              // al flujo — son la plata del mes que todavía no se movió.
              <>
                <Fila
                  label="Ventas del periodo aún no cobradas"
                  valores={meses.map((m) => porMes[m].porCobrar)}
                  conVariacion={conVariacion}
                />
                <Fila
                  label="Gastos del periodo aún no pagados"
                  valores={meses.map((m) => porMes[m].porPagar)}
                  negativo
                  conVariacion={conVariacion}
                />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
