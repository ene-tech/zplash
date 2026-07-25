"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import WebSettingsTab from "@/components/tabs/WebSettingsTab";
import WebSettingsServiciosTab from "@/components/tabs/WebSettingsServiciosTab";
import { CircleDollarSign, Images } from "lucide-react";

const TABS = [
  { id: "precios", label: "Precios", icon: CircleDollarSign },
  { id: "servicios", label: "Servicios y Banners", icon: Images },
] as const;

export default function WebSettingsView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.webSettingsTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Web Settings · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${ui.webSettingsTab === t.id ? "active" : ""}`}
                onClick={() => patchUi({ webSettingsTab: t.id })}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "precios" && <WebSettingsTab />}
            {tabActual.id === "servicios" && <WebSettingsServiciosTab />}
          </div>
        </div>
      </div>
    </>
  );
}
