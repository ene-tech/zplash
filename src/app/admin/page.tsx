"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { AppProvider, useApp } from "@/context/AppContext";
import LoginScreen from "@/components/LoginScreen";

// Cada vista se carga solo cuando el usuario navega a ella: evita que el
// bundle inicial incluya el código de las 9 vistas del panel a la vez.
const OperadorView = dynamic(() => import("@/components/OperadorView"));
const AdminView = dynamic(() => import("@/components/AdminView"));
const HubView = dynamic(() => import("@/components/HubView"));
const ContabilidadView = dynamic(() => import("@/components/ContabilidadView"));
const InventarioView = dynamic(() => import("@/components/InventarioView"));
const MantencionView = dynamic(() => import("@/components/MantencionView"));
const FuncionarioView = dynamic(() => import("@/components/FuncionarioView"));
const MensajesView = dynamic(() => import("@/components/MensajesView"));
const CorreoView = dynamic(() => import("@/components/CorreoView"));
const ServiciosAdicionalesView = dynamic(() => import("@/components/ServiciosAdicionalesView"));
const WebSettingsView = dynamic(() => import("@/components/WebSettingsView"));
const ModalRoot = dynamic(() => import("@/components/modals/ModalRoot"));

function ZplashApp() {
  const { ui, loading, storageReady, storageChecked } = useApp();

  if (loading) {
    const showError = storageChecked && !storageReady;
    return (
      <div className="login-screen">
        <div className="brand">
          <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" />
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
      {ui.view === "funcionario" && <FuncionarioView />}
      {ui.view === "mensajes" && <MensajesView />}
      {ui.view === "correo" && <CorreoView />}
      <ModalRoot />
    </>
  );
}

export default function Home() {
  return (
    <div id="app" className="admin-app">
      <AppProvider>
        <ZplashApp />
      </AppProvider>
    </div>
  );
}
