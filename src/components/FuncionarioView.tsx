"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import AsistenciaTab from "@/components/tabs/funcionario/AsistenciaTab";
import TurnosFuncionarioTab from "@/components/tabs/funcionario/TurnosFuncionarioTab";
import TareasTurnoTab from "@/components/tabs/funcionario/TareasTurnoTab";
import ContratoTab from "@/components/tabs/funcionario/ContratoTab";
import { CalendarDays, ClipboardCheck, FileText, MapPin } from "lucide-react";

const TABS = [
  { id: "asistencia", label: "Libro de Asistencia", icon: MapPin },
  { id: "turnos", label: "Horario y Turnos", icon: CalendarDays },
  { id: "tareas", label: "Apertura y Cierre", icon: ClipboardCheck },
  { id: "contrato", label: "Mi Contrato", icon: FileText },
] as const;

export default function FuncionarioView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.funcionarioTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Mi Entorno · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${tabActual.id === t.id ? "active" : ""}`}
                onClick={() => patchUi({ funcionarioTab: t.id, search: "" })}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "asistencia" && <AsistenciaTab />}
            {tabActual.id === "turnos" && <TurnosFuncionarioTab />}
            {tabActual.id === "tareas" && <TareasTurnoTab />}
            {tabActual.id === "contrato" && <ContratoTab />}
          </div>
        </div>
      </div>
    </>
  );
}
