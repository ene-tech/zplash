"use client";

import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import ProductosTab from "@/components/tabs/ProductosTab";
import ProveedoresTab from "@/components/tabs/ProveedoresTab";
import CategoriasProductoTab from "@/components/tabs/CategoriasProductoTab";
import CategoriasInsumoTab from "@/components/tabs/CategoriasInsumoTab";
import InsumosTab from "@/components/tabs/InsumosTab";
import StockDestinosTab from "@/components/tabs/StockDestinosTab";
import DestinosInventarioTab from "@/components/tabs/DestinosInventarioTab";
import GuiaTraspasoTab from "@/components/tabs/GuiaTraspasoTab";
import BodegasTab from "@/components/tabs/BodegasTab";
import { Package, Tags, Truck, Boxes, MapPin, Warehouse, ClipboardList } from "lucide-react";

const TABS = [
  { id: "productos", label: "Productos", icon: Package },
  { id: "categorias", label: "Categorías", icon: Tags },
  { id: "proveedores", label: "Proveedores", icon: Truck },
  { id: "insumos", label: "Insumos", icon: Boxes },
  { id: "destinos", label: "Destinos", icon: MapPin },
  { id: "bodegas", label: "Bodegas", icon: Warehouse },
  { id: "traspasarGuia", label: "Guías de Despacho", icon: ClipboardList },
] as const;

export default function InventarioView() {
  const { ui, patchUi, logout } = useApp();
  const tabActual = TABS.find((t) => t.id === ui.inventarioTab) || TABS[0];

  return (
    <>
      <Topbar
        mode={`Inventario · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${ui.inventarioTab === t.id ? "active" : ""}`}
                onClick={() => patchUi({ inventarioTab: t.id, search: "" })}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {tabActual.id === "productos" && <ProductosTab />}
            {tabActual.id === "categorias" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                <CategoriasProductoTab />
                <CategoriasInsumoTab />
              </div>
            )}
            {tabActual.id === "proveedores" && <ProveedoresTab />}
            {tabActual.id === "insumos" && <InsumosTab />}
            {tabActual.id === "destinos" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <StockDestinosTab />
                <DestinosInventarioTab />
              </div>
            )}
            {tabActual.id === "bodegas" && <BodegasTab />}
            {tabActual.id === "traspasarGuia" && <GuiaTraspasoTab />}
          </div>
        </div>
      </div>
    </>
  );
}
