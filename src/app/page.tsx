"use client";

import Image from "next/image";
import { AppProvider, useApp } from "@/context/AppContext";
import LoginScreen from "@/components/LoginScreen";
import OperadorView from "@/components/OperadorView";
import AdminView from "@/components/AdminView";
import HubView from "@/components/HubView";
import ContabilidadView from "@/components/ContabilidadView";
import ServiciosAdicionalesView from "@/components/ServiciosAdicionalesView";
import ModalRoot from "@/components/modals/ModalRoot";

function ZplashApp() {
  const { ui, loading, storageReady, storageChecked } = useApp();

  if (loading) {
    const showError = storageChecked && !storageReady;
    return (
      <div className="login-screen">
        <div className="brand">
          <Image src="/logo.jpg" alt="ZPlash" width={200} height={76} className="brand-logo" unoptimized />
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
