"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useStatsData } from "@/components/tabs/stats/useStatsData";
import { RecorridoEtapas } from "@/components/tabs/stats/RecorridoEtapas";
import { StatsResumenGlobal } from "@/components/tabs/stats/StatsResumenGlobal";
import { StatsResumenPeriodo } from "@/components/tabs/stats/StatsResumenPeriodo";
import { StatsUsoPlanes } from "@/components/tabs/stats/StatsUsoPlanes";

export default function StatsTab() {
  // Mismo motivo que en CierreTab: se llama siempre, aunque ventas/ingresos
  // todavía no lleguen (oleada "historial", ver AppContext).
  const r = useStatsData();
  const { loadingHistorial } = useAppData();
  // Sub-pestaña local y no un módulo propio: el permiso que corresponde es el
  // mismo "stats" que ya habilita este tab, y agregar un Modulo nuevo dejaría
  // la pantalla invisible en producción hasta que Gerencia se lo asigne a
  // mano a cada perfil (los perfiles guardan su lista de módulos en la base).
  const [vista, setVista] = useState<"resumen" | "recorrido">("resumen");

  const pestanas = (
    <div className="tabs">
      <div className={`tab ${vista === "resumen" ? "active" : ""}`} onClick={() => setVista("resumen")}>
        <span className="tab-label">Resumen</span>
      </div>
      <div className={`tab ${vista === "recorrido" ? "active" : ""}`} onClick={() => setVista("recorrido")}>
        <span className="tab-label">Recorrido del cliente</span>
      </div>
    </div>
  );

  // El embudo tiene su propio aviso de carga por fila, así que no se bloquea
  // entero esperando la oleada pesada como sí hace el resumen.
  if (vista === "recorrido") {
    return (
      <div>
        {pestanas}
        <RecorridoEtapas />
      </div>
    );
  }

  if (loadingHistorial) {
    return (
      <div>
        {pestanas}
        <div className="empty">Cargando historial de ventas e ingresos…</div>
      </div>
    );
  }

  return (
    <div>
      {pestanas}
      <StatsResumenGlobal
        clientesTotales={r.data.clientes.length}
        ingresosHoy={r.ingresosHoy}
        ingresosHistoricos={r.data.ingresos.length}
        porVencer={r.porVencer}
        vencidos={r.vencidos}
        vencidosWeb={r.vencidosWeb}
        vencidosLocal={r.vencidosLocal}
        sinPlan={r.sinPlan}
        vigentes={r.vigentes.length}
        vigentesWeb={r.vigentesWeb}
        vigentesLocal={r.vigentesLocal}
      />

      <StatsResumenPeriodo
        patchUi={r.patchUi}
        desde={r.desde}
        hasta={r.hasta}
        promedioLavadosDiariosPeriodo={r.promedioLavadosDiariosPeriodo}
        montoTotalPeriodo={r.montoTotalPeriodo}
        conPlan={r.conPlan}
        por9990={r.por9990}
        ticketGratis={r.ticketGratis}
        ticketPagado={r.ticketPagado}
        limpiezasCompletas={r.limpiezasCompletas}
        pctPlanes={r.pctPlanes}
        pct9990={r.pct9990}
        pctTickets={r.pctTickets}
        pctLimpiezas={r.pctLimpiezas}
        montoPlanes={r.montoPlanes}
        montoPor9990={r.montoPor9990}
        montoTickets={r.montoTickets}
        montoLimpiezas={r.montoLimpiezas}
        pctMontoPlanes={r.pctMontoPlanes}
        pctMonto9990={r.pctMonto9990}
        pctMontoTickets={r.pctMontoTickets}
        pctMontoLimpiezas={r.pctMontoLimpiezas}
      />

      <StatsUsoPlanes
        promedioVisitasPlan={r.promedioVisitasPlan}
        clientesConPlanCantidad={r.clientesConPlan.length}
        filasDistribucion={r.filasDistribucion}
        top10={r.top10}
        bottom10={r.bottom10}
      />
    </div>
  );
}
