"use client";

import { useApp } from "@/context/AppContext";
import {
  fmtCLP,
  inRange,
  planStatus,
  primerDiaMesActualYMD,
  todayStr,
  todayYMD,
} from "@/lib/helpers";
import type { Cliente } from "@/types";

export default function StatsTab() {
  const { data, ui, patchUi } = useApp();
  const hoy = todayStr();
  const ingresosHoy = data.ingresos.filter((i) => new Date(i.fecha).toDateString() === hoy).length;
  const vencidos = data.clientes.filter((c) => planStatus(c).label === "Vencido").length;
  const sinPlan = data.clientes.filter((c) => planStatus(c).label === "Sin plan").length;
  const porVencer = data.clientes.filter((c) => planStatus(c).cls === "warn").length;
  const vigentes = data.clientes.filter((c) => planStatus(c).cls !== "bad");
  const vigentesWeb = vigentes.filter((c) => c.origen === "WEB").length;
  const vigentesLocal = vigentes.length - vigentesWeb;

  // --- Resumen por período (fechas seleccionables) ---
  const desde = ui.statsDesde || primerDiaMesActualYMD();
  const hasta = ui.statsHasta || todayYMD();

  const cuponPorCodigo = new Map(data.cupones.map((c) => [c.codigo, c]));
  const cuponValor = (cuponCodigo: string | undefined) =>
    (cuponCodigo && cuponPorCodigo.get(cuponCodigo)?.valor) || 0;

  // Las garantías (relavado gratis por reclamo) no se consideran en este resumen. Los ingresos con
  // glosa propia (p. ej. "Limpieza Completa" de un detailing, ya cobrado como servicio adicional) sí
  // se cuentan, pero en su propio bucket: no son plan, ni $9.990, ni ticket.
  const ingresosPeriodo = data.ingresos.filter((i) => inRange(i.fecha, desde, hasta) && !i.esGarantia);
  const conPlan = ingresosPeriodo.filter((i) => !i.viaCupon && !i.glosa && i.planEstadoAlIngreso !== "bad");
  const por9990 = ingresosPeriodo.filter((i) => !i.viaCupon && !i.glosa && i.planEstadoAlIngreso === "bad");
  const ticketGratis = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) === 0);
  const ticketPagado = ingresosPeriodo.filter((i) => i.viaCupon && cuponValor(i.cuponCodigo) > 0);
  const limpiezasCompletas = ingresosPeriodo.filter((i) => !i.viaCupon && i.glosa);

  const totalPeriodo = ingresosPeriodo.length;
  const pct = (n: number) => (totalPeriodo ? ((n / totalPeriodo) * 100).toFixed(1) : "0.0") + "%";
  const pctTickets = pct(ticketGratis.length + ticketPagado.length);
  const pctPlanes = pct(conPlan.length);
  const pct9990 = pct(por9990.length);
  const pctLimpiezas = pct(limpiezasCompletas.length);

  // Monto vendido por categoría en el período. "Planes" no se calcula desde
  // conPlan (esos lavados van incluidos en un plan ya pagado antes, sin venta
  // asociada): se calcula desde data.ventas, sumando las ventas de
  // contratación/renovación de plan del período. $9.990 usa el precio fijo de
  // lavado único. Ticket gratis siempre aporta $0 (por eso no se suma aparte).
  // Limpiezas completas se vende en Servicios Adicionales, así que su monto
  // se busca en la Venta ligada por citaId, no en el Ingreso.
  const TIPOS_VENTA_PLAN = new Set([
    "Plan nuevo",
    "Renovación preferencial",
    "Plan nuevo (Web)",
    "Renovación (Web)",
    "Renovación Web (manual)",
  ]);
  const montoPlanes = data.ventas
    .filter((v) => TIPOS_VENTA_PLAN.has(v.tipo) && inRange(v.fecha, desde, hasta))
    .reduce((s, v) => s + (v.precio || 0), 0);
  const montoPor9990 = por9990.length * 9990;
  const montoTickets = ticketPagado.reduce((s, i) => s + cuponValor(i.cuponCodigo), 0);
  const ventaPorCitaId = new Map(data.ventas.filter((v) => v.citaId).map((v) => [v.citaId, v]));
  const montoLimpiezas = limpiezasCompletas.reduce(
    (s, i) => s + (i.citaId ? ventaPorCitaId.get(i.citaId)?.precio || 0 : 0),
    0
  );
  const montoTotalPeriodo = montoPlanes + montoPor9990 + montoTickets + montoLimpiezas;

  // --- Uso de planes y ranking de clientes, según el período seleccionado arriba ---
  const clientesPorId = new Map(data.clientes.map((c) => [c.id, c]));
  const ingresosVisitasPeriodo = data.ingresos.filter((i) => inRange(i.fecha, desde, hasta));

  // Promedio diario de lavados en el período seleccionado. Si "hasta" llega hasta hoy o más
  // adelante, el fin del cálculo se acota a hoy para no contar días que todavía no transcurren.
  const finPeriodoTranscurrido = hasta < todayYMD() ? hasta : todayYMD();
  const diasPeriodo =
    Math.round(
      (new Date(finPeriodoTranscurrido + "T00:00:00").getTime() - new Date(desde + "T00:00:00").getTime()) / 86400000
    ) + 1;
  const promedioLavadosDiariosPeriodo = diasPeriodo > 0 ? ingresosVisitasPeriodo.length / diasPeriodo : 0;

  const visitasPorCliente = new Map<string, number>();
  ingresosVisitasPeriodo.forEach((i) => {
    if (!i.clienteId) return;
    visitasPorCliente.set(i.clienteId, (visitasPorCliente.get(i.clienteId) || 0) + 1);
  });

  const clientesConPlan = data.clientes.filter((c) => c.plan);
  const totalVisitasPlan = clientesConPlan.reduce((s, c) => s + (visitasPorCliente.get(c.id) || 0), 0);
  const promedioVisitasPlan = clientesConPlan.length ? totalVisitasPlan / clientesConPlan.length : 0;

  // Un cliente con plan que no pasó ni una vez en el período no genera ingresos, así que nunca
  // aparecería en el ranking: hay que sumarlo a mano con 0 pasadas para que el "top 10 que menos
  // han pasado" sea consistente con el promedio de arriba (que sí cuenta los 0).
  const clientesConPlanSinVisitas = clientesConPlan.filter((c) => !visitasPorCliente.has(c.id));
  const conVisitas = [
    ...Array.from(visitasPorCliente.entries())
      .map(([clienteId, cantidad]) => ({ cliente: clientesPorId.get(clienteId), cantidad }))
      .filter((x): x is { cliente: Cliente; cantidad: number } => !!x.cliente),
    ...clientesConPlanSinVisitas.map((cliente) => ({ cliente, cantidad: 0 })),
  ];

  const ordenNombre = (a: { cliente: Cliente }, b: { cliente: Cliente }) =>
    a.cliente.nombre.localeCompare(b.cliente.nombre, "es");

  const top10 = [...conVisitas].sort((a, b) => b.cantidad - a.cantidad || ordenNombre(a, b)).slice(0, 10);
  const bottom10 = [...conVisitas].sort((a, b) => a.cantidad - b.cantidad || ordenNombre(a, b)).slice(0, 10);

  // Distribución de pasadas: cuántos clientes con plan pasaron exactamente N veces en el período,
  // y qué porcentaje representan sobre el total de clientes con plan.
  const distribucionVisitas = new Map<number, number>();
  clientesConPlan.forEach((c) => {
    const cantidad = visitasPorCliente.get(c.id) || 0;
    distribucionVisitas.set(cantidad, (distribucionVisitas.get(cantidad) || 0) + 1);
  });
  const filasDistribucion = Array.from(distribucionVisitas.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([cantidad, clientes]) => ({
      cantidad,
      clientes,
      pct: clientesConPlan.length ? ((clientes / clientesConPlan.length) * 100).toFixed(1) + "%" : "0.0%",
      pctPasadas: totalVisitasPlan ? (((cantidad * clientes) / totalVisitasPlan) * 100).toFixed(1) + "%" : "0.0%",
    }));

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{data.clientes.length}</div>
          <div className="lbl">Clientes totales</div>
        </div>
        <div className="stat-card">
          <div className="num">{ingresosHoy}</div>
          <div className="lbl">Ingresos hoy</div>
        </div>
        <div className="stat-card">
          <div className="num">{data.ingresos.length}</div>
          <div className="lbl">Ingresos históricos</div>
        </div>
        <div className="stat-card warn">
          <div className="num">{porVencer}</div>
          <div className="lbl">Planes por vencer</div>
        </div>
        <div className="stat-card bad">
          <div className="num">{vencidos}</div>
          <div className="lbl">Planes vencidos</div>
        </div>
        <div className="stat-card bad">
          <div className="num">{sinPlan}</div>
          <div className="lbl">Sin plan</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{vigentes.length}</div>
          <div className="lbl">Planes vigentes</div>
        </div>
        <div className="stat-card">
          <div className="num">{vigentesWeb}</div>
          <div className="lbl">Vigentes · Web</div>
        </div>
        <div className="stat-card">
          <div className="num">{vigentesLocal}</div>
          <div className="lbl">Vigentes · Local</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Resumen por período</h3>
      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input
            type="date"
            value={desde}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ statsDesde: e.target.value })}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input
            type="date"
            value={hasta}
            style={{ maxWidth: 170 }}
            onChange={(e) => patchUi({ statsHasta: e.target.value })}
          />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => patchUi({ statsDesde: primerDiaMesActualYMD(), statsHasta: todayYMD() })}
        >
          Mes actual
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{promedioLavadosDiariosPeriodo.toFixed(1)}</div>
          <div className="lbl">Lavados promedios día del Período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(montoTotalPeriodo)}</div>
          <div className="lbl">Monto total de venta del período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(montoTotalPeriodo / 1.19)}</div>
          <div className="lbl">Monto total neto del período</div>
        </div>
        <div className="stat-card">
          <div className="num">{conPlan.length}</div>
          <div className="lbl">Autos con plan</div>
        </div>
        <div className="stat-card">
          <div className="num">{por9990.length}</div>
          <div className="lbl">Autos por {fmtCLP(9990)}</div>
        </div>
        <div className="stat-card">
          <div className="num">{ticketGratis.length}</div>
          <div className="lbl">Ticket gratis</div>
        </div>
        <div className="stat-card">
          <div className="num">{ticketPagado.length}</div>
          <div className="lbl">Ticket pagado</div>
        </div>
        <div className="stat-card">
          <div className="num">{limpiezasCompletas.length}</div>
          <div className="lbl">Limpiezas completas</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Distribución de ingresos por tipo</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">
            {conPlan.length} · {pctPlanes}
          </div>
          <div className="lbl">Planes</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(montoPlanes)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {por9990.length} · {pct9990}
          </div>
          <div className="lbl">{fmtCLP(9990)}</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(montoPor9990)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {ticketGratis.length + ticketPagado.length} · {pctTickets}
          </div>
          <div className="lbl">Tickets</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(montoTickets)}
          </div>
        </div>
        <div className="stat-card">
          <div className="num">
            {limpiezasCompletas.length} · {pctLimpiezas}
          </div>
          <div className="lbl">Limpiezas completas</div>
          <div className="lbl" style={{ marginTop: 4 }}>
            {fmtCLP(montoLimpiezas)}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>Uso de planes · período seleccionado</h3>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{promedioVisitasPlan.toFixed(1)}</div>
          <div className="lbl">Promedio de pasadas por cliente con plan ({clientesConPlan.length} clientes)</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>
        Distribución de pasadas · clientes con plan
      </h3>
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

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>
        Top 10 clientes que más han pasado
      </h3>
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

      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 10px" }}>
        Top 10 clientes que menos han pasado
      </h3>
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
    </div>
  );
}
