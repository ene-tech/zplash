"use client";

import { useApp } from "@/context/AppContext";
import ClientModal from "@/components/modals/ClientModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import PerfilModal from "@/components/modals/PerfilModal";
import BulkModal from "@/components/modals/BulkModal";
import PagoModal from "@/components/modals/PagoModal";
import ClienteInfoModal from "@/components/modals/ClienteInfoModal";
import EmpresaModal from "@/components/modals/EmpresaModal";
import ProductoModal from "@/components/modals/ProductoModal";
import ProveedorModal from "@/components/modals/ProveedorModal";
import InsumoModal from "@/components/modals/InsumoModal";
import TraspasoModal from "@/components/modals/TraspasoModal";
import ServicioAdicionalModal from "@/components/modals/ServicioAdicionalModal";
import MaquinariaFichaModal from "@/components/modals/MaquinariaFichaModal";

export default function ModalRoot() {
  const { ui } = useApp();
  const m = ui.modal;
  if (!m) return null;

  if (m.type === "servicioAdicional") return <ServicioAdicionalModal data={m.data} />;
  if (m.type === "confirm") {
    return <ConfirmModal mensaje={m.mensaje} onConfirm={m.onConfirm} confirmLabel={m.confirmLabel} danger={m.danger} />;
  }
  if (m.type === "client") return <ClientModal data={m.data} contexto={m.contexto} patenteInicial={m.patenteInicial} />;
  if (m.type === "perfil") return <PerfilModal data={m.data} />;
  if (m.type === "bulk") return <BulkModal />;
  if (m.type === "pago") return <PagoModal monto={m.monto} descripcion={m.descripcion} onConfirm={m.onConfirm} />;
  if (m.type === "clienteInfo") return <ClienteInfoModal data={m.data} />;
  if (m.type === "empresa") return <EmpresaModal data={m.data} />;
  if (m.type === "producto") return <ProductoModal data={m.data} />;
  if (m.type === "proveedor") return <ProveedorModal data={m.data} />;
  if (m.type === "insumo") return <InsumoModal data={m.data} />;
  if (m.type === "traspasoInventario") return <TraspasoModal productoId={m.productoId} />;
  if (m.type === "maquinariaFicha") return <MaquinariaFichaModal data={m.data} />;
  return null;
}
