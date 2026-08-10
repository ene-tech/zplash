"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MovimientoContableTab from "@/components/tabs/MovimientoContableTab";
import GastoEstadoTab from "@/components/tabs/GastoEstadoTab";
import CuentasPorPagarTab from "@/components/tabs/CuentasPorPagarTab";
import CuentasPorCobrarTab from "@/components/tabs/CuentasPorCobrarTab";
import EERRTab from "@/components/tabs/EERRTab";
import ContabilidadConfigTab from "@/components/tabs/ContabilidadConfigTab";
import ConciliacionBancariaTab from "@/components/tabs/ConciliacionBancariaTab";
import { ArrowDownCircle, Receipt, ArrowUpCircle, HandCoins, Wallet, Landmark, FileBarChart, Settings } from "lucide-react";

const TABS = [
  { id: "egreso", label: "Egresos / Gastos", icon: ArrowDownCircle },
  { id: "rendiciones", label: "Rendiciones", icon: Receipt },
  { id: "ingreso", label: "Ingresos fuera de la operación", icon: ArrowUpCircle },
  { id: "cuenta_por_cobrar", label: "Cuentas por Cobrar", icon: HandCoins },
  { id: "cuenta_por_pagar", label: "Cuentas por Pagar", icon: Wallet },
  { id: "conciliacion", label: "Conciliación Bancaria", icon: Landmark },
  { id: "eerr", label: "EERR", icon: FileBarChart },
  { id: "config", label: "Configuración", icon: Settings },
] as const;

export default function ContabilidadView() {
  const { ui, patchUi, logout, loadingHistorial } = useApp();
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
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {/* Todas las pestañas salvo "config" leen `data.movimientosContables`
                (saldos, EERR, cuentas por cobrar/pagar, conciliación) — llega en
                la oleada "historial" (ver AppContext). Se gatea el panel entero
                en vez de cada pestaña por separado porque es más fácil de
                mantener correcto y Contabilidad no es una vista de uso
                instantáneo como Clientes u Operador. Ver diagnóstico de
                performance 2026-08-10. */}
            {loadingHistorial && tabActual.id !== "config" ? (
              <div className="empty">Cargando historial contable…</div>
            ) : tabActual.id === "config" ? (
              <ContabilidadConfigTab />
            ) : tabActual.id === "eerr" ? (
              <EERRTab />
            ) : tabActual.id === "rendiciones" ? (
              <GastoEstadoTab estado="x_rendir" titulo="Rendiciones" />
            ) : tabActual.id === "cuenta_por_pagar" ? (
              <CuentasPorPagarTab />
            ) : tabActual.id === "cuenta_por_cobrar" ? (
              <CuentasPorCobrarTab />
            ) : tabActual.id === "conciliacion" ? (
              <ConciliacionBancariaTab />
            ) : (
              <MovimientoContableTab tipo={tabActual.id} titulo={tabActual.label} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
