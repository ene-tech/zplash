"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MovimientoContableTab from "@/components/tabs/MovimientoContableTab";
import GastoEstadoTab from "@/components/tabs/GastoEstadoTab";
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
  const { ui, patchUi } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.contabilidadTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Contabilidad · ${ui.adminActual || ""}`}
        onLogout={() => patchUi({ view: "login", adminActual: null })}
        onBack={() => patchUi({ view: "adminHub" })}
      />
      <div className="content">
        <div className="tabs">
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
        {tabActual.id === "eerr" ? (
          <EERRTab />
        ) : tabActual.id === "rendiciones" ? (
          <GastoEstadoTab estado="x_rendir" titulo="Rendiciones" />
        ) : tabActual.id === "cuenta_por_pagar" ? (
          <GastoEstadoTab estado="pendiente_pago" titulo="Cuentas por Pagar" />
        ) : (
          <MovimientoContableTab tipo={tabActual.id} titulo={tabActual.label} />
        )}
      </div>
    </>
  );
}
