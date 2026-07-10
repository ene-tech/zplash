"use client";

import { useApp } from "@/context/AppContext";
import ClientModal from "@/components/modals/ClientModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import PerfilModal from "@/components/modals/PerfilModal";
import BulkModal from "@/components/modals/BulkModal";
import PagoModal from "@/components/modals/PagoModal";
import ClienteInfoModal from "@/components/modals/ClienteInfoModal";
import EmpresaModal from "@/components/modals/EmpresaModal";

export default function ModalRoot() {
  const { ui } = useApp();
  const m = ui.modal;
  if (!m) return null;

  return (
    <div className="modal-overlay">
      {m.type === "client" && <ClientModal data={m.data} contexto={m.contexto} />}
      {m.type === "confirm" && (
        <ConfirmModal mensaje={m.mensaje} onConfirm={m.onConfirm} confirmLabel={m.confirmLabel} danger={m.danger} />
      )}
      {m.type === "perfil" && <PerfilModal data={m.data} />}
      {m.type === "bulk" && <BulkModal />}
      {m.type === "pago" && <PagoModal monto={m.monto} descripcion={m.descripcion} onConfirm={m.onConfirm} />}
      {m.type === "clienteInfo" && <ClienteInfoModal data={m.data} />}
      {m.type === "empresa" && <EmpresaModal data={m.data} />}
    </div>
  );
}
