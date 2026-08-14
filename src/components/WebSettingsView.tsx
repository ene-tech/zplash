"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import WebSettingsTab from "@/components/tabs/WebSettingsTab";
import WebSettingsServiciosTab from "@/components/tabs/WebSettingsServiciosTab";
import WebSettingsMailTab from "@/components/tabs/WebSettingsMailTab";
import ReglasCorreoTab from "@/components/tabs/ReglasCorreoTab";
import HistorialCorreoTab from "@/components/tabs/HistorialCorreoTab";
import WebSettingsWhatsappTab from "@/components/tabs/WebSettingsWhatsappTab";
import WebSettingsWhatsappBotTab from "@/components/tabs/WebSettingsWhatsappBotTab";
import ReglasWhatsappTab from "@/components/tabs/ReglasWhatsappTab";
import HistorialWhatsappTab from "@/components/tabs/HistorialWhatsappTab";
import WebSettingsMensajesUnicosTab from "@/components/tabs/WebSettingsMensajesUnicosTab";
import { Bot, CircleDollarSign, History, Images, Mail, MessageCircle, Send, Zap } from "lucide-react";

const TABS = [
  { id: "precios", label: "Precios", icon: CircleDollarSign },
  { id: "servicios", label: "Servicios y Banners", icon: Images },
  { id: "mail", label: "Mail Templates", icon: Mail },
  { id: "correo_reglas", label: "Reglas Correo", icon: Zap },
  { id: "correo_historial", label: "Historial Correo", icon: History },
  { id: "whatsapp", label: "WhatsApp Plantillas", icon: MessageCircle },
  { id: "whatsapp_bot", label: "Menú Bot WhatsApp", icon: Bot },
  { id: "whatsapp_reglas", label: "Reglas WhatsApp", icon: Zap },
  { id: "whatsapp_historial", label: "Historial WhatsApp", icon: History },
  { id: "whatsapp_masivo", label: "Mensajes Únicos", icon: Send },
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
            {tabActual.id === "mail" && <WebSettingsMailTab />}
            {tabActual.id === "correo_reglas" && <ReglasCorreoTab />}
            {tabActual.id === "correo_historial" && <HistorialCorreoTab />}
            {tabActual.id === "whatsapp" && <WebSettingsWhatsappTab />}
            {tabActual.id === "whatsapp_bot" && <WebSettingsWhatsappBotTab />}
            {tabActual.id === "whatsapp_reglas" && <ReglasWhatsappTab />}
            {tabActual.id === "whatsapp_historial" && <HistorialWhatsappTab />}
            {tabActual.id === "whatsapp_masivo" && <WebSettingsMensajesUnicosTab />}
          </div>
        </div>
      </div>
    </>
  );
}
