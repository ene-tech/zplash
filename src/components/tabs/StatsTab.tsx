"use client";

import { useStatsData } from "@/components/tabs/stats/useStatsData";
import { StatsResumenGlobal } from "@/components/tabs/stats/StatsResumenGlobal";
import { StatsResumenPeriodo } from "@/components/tabs/stats/StatsResumenPeriodo";
import { StatsUsoPlanes } from "@/components/tabs/stats/StatsUsoPlanes";

export default function StatsTab() {
  const r = useStatsData();

  return (
    <div>
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
