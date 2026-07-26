"use client";

import { descargarCierre, descargarFacturables } from "@/lib/actions";
import { todayYMD } from "@/lib/helpers";
import { useCierreData } from "@/components/tabs/cierre/useCierreData";
import { DetalleVentaYMetodosPago } from "@/components/tabs/cierre/DetalleVentaYMetodosPago";
import { FacturasPendientesTablas } from "@/components/tabs/cierre/FacturasPendientesTablas";
import { ServiciosAdicionalesPeriodoTabla } from "@/components/tabs/cierre/ServiciosAdicionalesPeriodoTabla";
import { ClientesFacturaTabla } from "@/components/tabs/cierre/ClientesFacturaTabla";
import { DetalleIngresosTabla } from "@/components/tabs/cierre/DetalleIngresosTabla";

export default function CierreTab() {
  const r = useCierreData();

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input
            type="date"
            value={r.desde}
            style={{ maxWidth: 170 }}
            onChange={(e) => r.patchUi({ cierreDesde: e.target.value })}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input
            type="date"
            value={r.hasta}
            style={{ maxWidth: 170 }}
            onChange={(e) => r.patchUi({ cierreHasta: e.target.value })}
          />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => r.patchUi({ cierreDesde: todayYMD(), cierreHasta: todayYMD() })}
        >
          Hoy
        </button>
        <button className="btn" style={{ alignSelf: "flex-end" }} onClick={() => descargarCierre(r.data, r.desde, r.hasta)}>
          Descargar cierre (Excel)
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{r.ingresosPeriodo.length}</div>
          <div className="lbl">Ingresos en el período</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{r.autosConPlan}</div>
          <div className="lbl">Autos con plan vigente</div>
        </div>
        <div className="stat-card bad">
          <div className="num">{r.sinPlan}</div>
          <div className="lbl">Autos por Lavado único</div>
        </div>
        <div className="stat-card">
          <div className="num">{r.nuevosPeriodo.length}</div>
          <div className="lbl">Cantidad de Clientes Nuevos Registrados</div>
        </div>
        <div className="stat-card">
          <div className="num">{r.ventasPeriodo.length}</div>
          <div className="lbl">Cantidad de Ventas</div>
        </div>
      </div>

      <DetalleVentaYMetodosPago
        filasVenta={r.filasVenta}
        totalCantidadVentas={r.totalCantidadVentas}
        totalMontoVentas={r.totalMontoVentas}
        modificacionesAdmin={r.modificacionesAdmin}
        otrasVentas={r.otrasVentas}
        metodosPago={r.metodosPago}
        totalCantidadMetodosPago={r.totalCantidadMetodosPago}
        totalMontoMetodosPago={r.totalMontoMetodosPago}
      />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="num">{r.ingresosPeriodo.length}</div>
          <div className="lbl">Vehículos ingresados</div>
        </div>
        <div className="stat-card">
          <div className="num">{r.autosServiciosAdicionales}</div>
          <div className="lbl">Autos con servicios adicionales</div>
        </div>
        <div className="stat-card">
          <div className="num">{r.autosConCupon}</div>
          <div className="lbl">Vehículos con cupón Venta Empresa</div>
        </div>
        <div className="stat-card warn">
          <div className="num">{r.facturaPendientesPeriodo.length}</div>
          <div className="lbl">Facturas pendientes de emitir</div>
        </div>
      </div>

      <FacturasPendientesTablas facturaPendientesPeriodo={r.facturaPendientesPeriodo} facturasEmpresaPeriodo={r.facturasEmpresaPeriodo} />

      <ServiciosAdicionalesPeriodoTabla items={r.serviciosAdicionalesItems} />

      <ClientesFacturaTabla
        facturaFiltrados={r.facturaFiltrados}
        ingresos={r.ingresos}
        ventas={r.ventas}
        desde={r.desde}
        hasta={r.hasta}
        facturaSearch={r.ui.facturaSearch || ""}
        onSearchChange={(v) => r.patchUi({ facturaSearch: v })}
        onDescargar={() => descargarFacturables(r.data, r.facturaFiltrados, r.desde, r.hasta)}
      />

      <DetalleIngresosTabla ingresosPeriodo={r.ingresosPeriodo} />
    </div>
  );
}
