"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import HorariosEquipoTab from "@/components/tabs/equipo/HorariosEquipoTab";
import ChecklistsEquipoTab from "@/components/tabs/equipo/ChecklistsEquipoTab";
import ContratosEquipoTab from "@/components/tabs/equipo/ContratosEquipoTab";
import ReglasOperadorTab from "@/components/tabs/equipo/ReglasOperadorTab";
import { CalendarDays, ClipboardCheck, FileText, UserCog } from "lucide-react";

// La contracara administrativa de Mi Entorno (ver FuncionarioView): acá se
// puebla lo que allá se ve. Va gateada con el módulo "perfiles" —el mismo con
// el que el servidor gatea upsertTurnosFuncionario / upsertTareasTurno /
// upsertContratosFuncionario—, así que quien llegue igual no puede guardar.
const TABS = [
  { id: "horarios", label: "Horarios y Turnos", icon: CalendarDays },
  { id: "reglas", label: "Operadores y Reglas", icon: UserCog },
  { id: "checklists", label: "Apertura y Cierre", icon: ClipboardCheck },
  { id: "contratos", label: "Contratos", icon: FileText },
] as const;

export default function EquipoView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.equipoTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Gestión de Equipo · ${ui.perfilActual?.nombre || ""}`}
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
                onClick={() => patchUi({ equipoTab: t.id, search: "" })}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "horarios" && <HorariosEquipoTab />}
            {tabActual.id === "reglas" && <ReglasOperadorTab />}
            {tabActual.id === "checklists" && <ChecklistsEquipoTab />}
            {tabActual.id === "contratos" && <ContratosEquipoTab />}
          </div>
        </div>
      </div>
    </>
  );
}
