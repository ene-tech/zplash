"use client";

import Image from "next/image";
import { AppProvider, useApp } from "@/context/AppContext";
import LoginScreen from "@/components/LoginScreen";
import OperadorView from "@/components/OperadorView";
import AdminView from "@/components/AdminView";
import HubView from "@/components/HubView";
import ContabilidadView from "@/components/ContabilidadView";
import InventarioView from "@/components/InventarioView";
import MantencionView from "@/components/MantencionView";
import MensajesView from "@/components/MensajesView";
import ServiciosAdicionalesView from "@/components/ServiciosAdicionalesView";
import WebSettingsView from "@/components/WebSettingsView";
import ModalRoot from "@/components/modals/ModalRoot";

function ZplashApp() {
  const { ui, loading, storageReady, storageChecked } = useApp();

  if (loading) {
    const showError = storageChecked && !storageReady;
    return (
      <div className="login-screen">
        <div className="brand">
          <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" unoptimized />
          <div className="sub" style={showError ? { color: "var(--red)", maxWidth: 340 } : undefined}>
            {showError
              ? "No se pudo conectar al almacenamiento permanente. Los datos que ingreses ahora podrían no guardarse. Intenta recargar la página."
              : "Cargando datos..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {ui.view === "login" && <LoginScreen />}
      {ui.view === "operador" && <OperadorView />}
      {ui.view === "admin" && <AdminView />}
      {ui.view === "hub" && <HubView />}
      {ui.view === "contabilidad" && <ContabilidadView />}
      {ui.view === "servicios" && <ServiciosAdicionalesView />}
      {ui.view === "web_settings" && <WebSettingsView />}
      {ui.view === "inventario" && <InventarioView />}
      {ui.view === "mantencion" && <MantencionView />}
      {ui.view === "mensajes" && <MensajesView />}
      <ModalRoot />
    </>
  );
}

export default function Home() {
  return (
    <div id="app">
      <AppProvider>
        <ZplashApp />
      </AppProvider>
    </div>
  );
}
