"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MovimientoContableTab from "@/components/tabs/MovimientoContableTab";
import GastoEstadoTab from "@/components/tabs/GastoEstadoTab";
import CuentasPorPagarTab from "@/components/tabs/CuentasPorPagarTab";
import CuentasPorCobrarTab from "@/components/tabs/CuentasPorCobrarTab";
import EERRTab from "@/components/tabs/EERRTab";

const TABS = [
  { id: "egreso", label: "Egresos / Gastos" },
  { id: "rendiciones", label: "Rendiciones" },
  { id: "ingreso", label: "Ingresos" },
  { id: "cuenta_por_cobrar", label: "Cuentas por Cobrar" },
  { id: "cuenta_por_pagar", label: "Cuentas por Pagar" },
  { id: "eerr", label: "EERR" },
] as const;

export default function ContabilidadView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.contabilidadTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Contabilidad · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${ui.contabilidadTab === t.id ? "active" : ""}`}
                onClick={() => patchUi({ contabilidadTab: t.id })}
              >
                {t.label}
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "eerr" ? (
              <EERRTab />
            ) : tabActual.id === "rendiciones" ? (
              <GastoEstadoTab estado="x_rendir" titulo="Rendiciones" />
            ) : tabActual.id === "cuenta_por_pagar" ? (
              <CuentasPorPagarTab />
            ) : tabActual.id === "cuenta_por_cobrar" ? (
              <CuentasPorCobrarTab />
            ) : (
              <MovimientoContableTab tipo={tabActual.id} titulo={tabActual.label} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
