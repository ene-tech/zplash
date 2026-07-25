"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import ClientesTab from "@/components/tabs/ClientesTab";
import SuscripcionesTab from "@/components/tabs/SuscripcionesTab";
import IngresosTab from "@/components/tabs/IngresosTab";
import CierreTab from "@/components/tabs/CierreTab";
import PerfilesTab from "@/components/tabs/PerfilesTab";
import StatsTab from "@/components/tabs/StatsTab";
import ConfigTab from "@/components/tabs/ConfigTab";
import VentaEmpresaTab from "@/components/tabs/VentaEmpresaTab";
import EmpresasTab from "@/components/tabs/EmpresasTab";
import AgendaTab from "@/components/tabs/AgendaTab";
import type { Modulo } from "@/types";
import {
  CircleDollarSign,
  History,
  Users,
  Building2,
  RefreshCw,
  Ticket,
  CalendarDays,
  BarChart3,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";

const TABS: { id: Modulo; label: string; icon: LucideIcon }[] = [
  { id: "cierre", label: "Cierre de Caja", icon: CircleDollarSign },
  { id: "ingresos", label: "Historial de ingresos", icon: History },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "empresas_facturacion", label: "Empresas", icon: Building2 },
  { id: "suscripciones", label: "Suscripciones", icon: RefreshCw },
  { id: "empresa", label: "B2B/Tickets/Dsctos", icon: Ticket },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "stats", label: "Estadísticas", icon: BarChart3 },
  { id: "config", label: "Configuración", icon: Settings },
  { id: "perfiles", label: "Perfiles", icon: UserCog },
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
        <div className="tabs tabs-primary">
          {tabsPermitidas.map((t) => (
            <div
              key={t.id}
              className={`tab ${ui.adminTab === t.id ? "active" : ""}`}
              onClick={() => patchUi({ adminTab: t.id, search: "" })}
              title={t.label}
            >
              <t.icon />
              <span className="tab-label">{t.label}</span>
            </div>
          ))}
        </div>
        {ui.adminTab === "clientes" && <ClientesTab />}
        {ui.adminTab === "suscripciones" && <SuscripcionesTab />}
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
