"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppUi } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import MateriasPrimasTab from "@/components/tabs/fabricacion/MateriasPrimasTab";
import FormulasTab from "@/components/tabs/fabricacion/FormulasTab";
import RecepcionesFabricaTab from "@/components/tabs/fabricacion/RecepcionesFabricaTab";
import FabricarTab from "@/components/tabs/fabricacion/FabricarTab";
import ProductosTerminadosTab from "@/components/tabs/fabricacion/ProductosTerminadosTab";
import { cargarFabricacion } from "@/lib/serverActions";
import type { DatosFabricacion } from "@/types";
import { Factory, FlaskConical, ListOrdered, PackageCheck, Sheet } from "lucide-react";

const TABS = [
  { id: "recepciones", label: "Recepciones", icon: PackageCheck },
  { id: "materias", label: "Materias Primas, Insumos y Mano de Obra", icon: FlaskConical },
  { id: "formulas", label: "Fórmulas", icon: ListOrdered },
  { id: "fabricar", label: "Fabricación", icon: Factory },
  { id: "terminados", label: "Productos terminados", icon: Sheet },
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
              // whiteSpace inline: "Materias Primas, Insumos y Mano de Obra" no cabe en una línea del
              // menú lateral, y el nowrap de .tab (CSS global sin capa) le gana a una clase de Tailwind.
              <div
                key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                style={{ whiteSpace: "normal" }}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
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
                {tab === "fabricar" && <FabricarTab datos={datos} recargar={recargar} />}
                {tab === "terminados" && <ProductosTerminadosTab datos={datos} recargar={recargar} />}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
