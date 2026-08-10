"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import ServiciosAdicionalesForm from "@/components/ServiciosAdicionalesForm";
import ServiciosAdicionalesLog from "@/components/ServiciosAdicionalesLog";

export default function ServiciosAdicionalesView() {
  const { ui, patchUi, logout, loadingHistorial } = useApp();

  return (
    <>
      <Topbar
        mode={`Servicios Adicionales · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout({ loginMode: null })}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <ServiciosAdicionalesForm />
        {/* El log lista ventas de tipo servicio adicional (`data.ventas`),
            que llega en la oleada "historial" — ver AppContext y el
            diagnóstico de performance 2026-08-10. El formulario de arriba no
            depende de eso, así que se deja siempre visible. */}
        {loadingHistorial ? <div className="empty">Cargando historial de servicios…</div> : <ServiciosAdicionalesLog />}
      </div>
    </>
  );
}
