"use client";

import { memo } from "react";
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
const FabricacionView = dynamic(() => import("@/components/FabricacionView"));
const PosView = dynamic(() => import("@/components/PosView"));
const MantencionView = dynamic(() => import("@/components/MantencionView"));
const EstanquesView = dynamic(() => import("@/components/EstanquesView"));
const FuncionarioView = dynamic(() => import("@/components/FuncionarioView"));
const EquipoView = dynamic(() => import("@/components/EquipoView"));
const MensajesView = dynamic(() => import("@/components/MensajesView"));
const CorreoView = dynamic(() => import("@/components/CorreoView"));
const LibroView = dynamic(() => import("@/components/LibroView"));
const ServiciosAdicionalesView = dynamic(() => import("@/components/ServiciosAdicionalesView"));
const WebSettingsView = dynamic(() => import("@/components/WebSettingsView"));
const ModalRoot = dynamic(() => import("@/components/modals/ModalRoot"));

// ZplashApp lee data y ui (por `loading` y `ui.view`), así que se re-renderiza
// con cada commit y cada patchUi. Las vistas no reciben props: con memo, ese
// re-render de la raíz no baja a ellas, y cada una se re-renderiza solo por
// los contextos que lee ella misma. Ayuda a las que usan useAppData/useAppUi y
// a ModalRoot; las que llaman useApp() igual despiertan con todo, y por eso
// sus cálculos pesados van memoizados (ver diagnóstico de lag del mesón, oct-2026).
const Vista = memo(function Vista({ view }: { view: string }) {
  return (
    <>
      {view === "login" && <LoginScreen />}
      {view === "operador" && <OperadorView />}
      {view === "admin" && <AdminView />}
      {view === "hub" && <HubView />}
      {view === "contabilidad" && <ContabilidadView />}
      {view === "servicios" && <ServiciosAdicionalesView />}
      {view === "web_settings" && <WebSettingsView />}
      {view === "inventario" && <InventarioView />}
      {view === "fabricacion" && <FabricacionView />}
      {view === "pos" && <PosView />}
      {view === "mantencion" && <MantencionView />}
      {view === "estanques" && <EstanquesView />}
      {view === "funcionario" && <FuncionarioView />}
      {view === "equipo" && <EquipoView />}
      {view === "mensajes" && <MensajesView />}
      {view === "correo" && <CorreoView />}
      {view === "libro" && <LibroView />}
      <ModalRoot />
    </>
  );
});

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

  return <Vista view={ui.view} />;
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
