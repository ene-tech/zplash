"use client";

import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
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

// Cada pestaña se carga solo cuando el usuario navega a ella — mismo patrón
// que ya usa admin/page.tsx para las vistas de nivel superior. Sin esto,
// abrir "Cierre de Caja" también bajaba el código de las otras 9 pestañas,
// IngresosTab incluido (que carga `xlsx` para el botón de exportar).
const ClientesTab = dynamic(() => import("@/components/tabs/ClientesTab"));
const SuscripcionesTab = dynamic(() => import("@/components/tabs/SuscripcionesTab"));
const IngresosTab = dynamic(() => import("@/components/tabs/IngresosTab"));
const CierreTab = dynamic(() => import("@/components/tabs/CierreTab"));
const PerfilesTab = dynamic(() => import("@/components/tabs/PerfilesTab"));
const StatsTab = dynamic(() => import("@/components/tabs/StatsTab"));
const ConfigTab = dynamic(() => import("@/components/tabs/ConfigTab"));
const VentaEmpresaTab = dynamic(() => import("@/components/tabs/VentaEmpresaTab"));
const EmpresasTab = dynamic(() => import("@/components/tabs/EmpresasTab"));
const AgendaTab = dynamic(() => import("@/components/tabs/AgendaTab"));

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
