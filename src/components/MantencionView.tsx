"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MaquinariasTab from "@/components/tabs/MaquinariasTab";
import RegistrosMantencionTab from "@/components/tabs/RegistrosMantencionTab";
import AlertasMantencionTab from "@/components/tabs/AlertasMantencionTab";
import { Wrench, ClipboardList, CalendarClock } from "lucide-react";

const TABS = [
  { id: "maquinas", label: "Máquinas", icon: Wrench },
  { id: "alertas", label: "Alertas de Mantención", icon: CalendarClock },
  { id: "registros", label: "Registros de Mantención", icon: ClipboardList },
] as const;

export default function MantencionView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.mantencionTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Libro de Mantención Maquinaria · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${ui.mantencionTab === t.id ? "active" : ""}`}
                onClick={() => patchUi({ mantencionTab: t.id, search: "" })}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "maquinas" && <MaquinariasTab />}
            {tabActual.id === "alertas" && <AlertasMantencionTab />}
            {tabActual.id === "registros" && <RegistrosMantencionTab />}
          </div>
        </div>
      </div>
    </>
  );
}
