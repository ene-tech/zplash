"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppUi } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MateriasPrimasTab from "@/components/tabs/fabricacion/MateriasPrimasTab";
import FormulasTab from "@/components/tabs/fabricacion/FormulasTab";
import RecepcionesFabricaTab from "@/components/tabs/fabricacion/RecepcionesFabricaTab";
import { cargarFabricacion } from "@/lib/serverActions";
import type { DatosFabricacion } from "@/types";
import { FlaskConical, ListOrdered, PackageCheck } from "lucide-react";

const TABS = [
  { id: "recepciones", label: "Recepciones", icon: PackageCheck },
  { id: "materias", label: "Materias primas", icon: FlaskConical },
  { id: "formulas", label: "Fórmulas", icon: ListOrdered },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Datos propios de la pantalla (no van en AppData): se piden al entrar y se
 * vuelven a pedir después de cada cambio. */
export default function FabricacionView() {
  const { ui, patchUi, logout } = useAppUi();
  const [tab, setTab] = useState<TabId>("recepciones");
  const [datos, setDatos] = useState<DatosFabricacion | null>(null);
  const [error, setError] = useState("");

  const recargar = useCallback(async () => {
    const r = await cargarFabricacion();
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setError("");
    setDatos(r);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void recargar();
  }, [recargar]);

  return (
    <>
      <Topbar
        mode={`Fabricación · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} title={t.label}>
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {!datos ? (
              !error && <div className="empty">Cargando…</div>
            ) : (
              <>
                {tab === "recepciones" && <RecepcionesFabricaTab datos={datos} recargar={recargar} />}
                {tab === "materias" && <MateriasPrimasTab datos={datos} recargar={recargar} />}
                {tab === "formulas" && <FormulasTab datos={datos} recargar={recargar} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
