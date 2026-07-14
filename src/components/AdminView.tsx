"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import ClientesTab from "@/components/tabs/ClientesTab";
import IngresosTab from "@/components/tabs/IngresosTab";
import CierreTab from "@/components/tabs/CierreTab";
import PerfilesTab from "@/components/tabs/PerfilesTab";
import StatsTab from "@/components/tabs/StatsTab";
import ConfigTab from "@/components/tabs/ConfigTab";
import VentaEmpresaTab from "@/components/tabs/VentaEmpresaTab";
import EmpresasTab from "@/components/tabs/EmpresasTab";
import AgendaTab from "@/components/tabs/AgendaTab";
import type { Modulo } from "@/types";

const TABS: { id: Modulo; label: string }[] = [
  { id: "clientes", label: "Clientes" },
  { id: "ingresos", label: "Historial de ingresos" },
  { id: "cierre", label: "Cierre de Caja" },
  { id: "empresa", label: "B2B/Tickets/Dsctos" },
  { id: "empresas_facturacion", label: "Empresas" },
  { id: "perfiles", label: "Perfiles" },
  { id: "stats", label: "Estadísticas" },
  { id: "agenda", label: "Agenda" },
  { id: "config", label: "Configuración" },
];

export default function AdminView() {
  const { ui, patchUi, logout } = useApp();
  const modulos = ui.perfilActual?.modulos || [];
  const tabsPermitidas = TABS.filter((t) => modulos.includes(t.id));

  return (
    <>
      <Topbar
        mode={`Administrador de ingresos · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="tabs">
          {tabsPermitidas.map((t) => (
            <div
              key={t.id}
              className={`tab ${ui.adminTab === t.id ? "active" : ""}`}
              onClick={() => patchUi({ adminTab: t.id, search: "" })}
            >
              {t.label}
            </div>
          ))}
        </div>
        {ui.adminTab === "clientes" && <ClientesTab />}
        {ui.adminTab === "ingresos" && <IngresosTab />}
        {ui.adminTab === "cierre" && <CierreTab />}
        {ui.adminTab === "empresa" && <VentaEmpresaTab />}
        {ui.adminTab === "empresas_facturacion" && <EmpresasTab />}
        {ui.adminTab === "perfiles" && <PerfilesTab />}
        {ui.adminTab === "stats" && <StatsTab />}
        {ui.adminTab === "agenda" && <AgendaTab />}
        {ui.adminTab === "config" && <ConfigTab />}
      </div>
    </>
  );
}
