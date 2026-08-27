"use client";

import { useAppUi } from "@/context/AppContext";
import { MODULO_LABELS, TODOS_LOS_MODULOS } from "@/lib/helpers";
import type { PerfilPublico } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Pencil, Trash2, UserCog } from "lucide-react";
import { usePerfilRowState } from "./usePerfilRowState";
import { ResetClaveForm } from "./ResetClaveForm";

export function PerfilRowMobile({
  perfil,
  puedeAsignarPermisos,
  onEliminar,
}: {
  perfil: PerfilPublico;
  puedeAsignarPermisos: boolean;
  onEliminar: () => void;
}) {
  const { ui, patchUi } = useAppUi();
  const { editandoModulos, setEditandoModulos, reseteando, setReseteando, seleccion, toggleModulo, guardarModulos, guardando } =
    usePerfilRowState(perfil);

  return (
    <MobileRecordCard
      avatar={<MobileRecordAvatar icon={UserCog} />}
      title={perfil.nombre}
      subtitle={perfil.modulos.length ? perfil.modulos.map((m) => MODULO_LABELS[m]).join(", ") : "Sin módulos asignados"}
      menu={
        <MobileRowMenu
          actions={[
            { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "perfil", data: perfil } }) },
            ...(puedeAsignarPermisos
              ? [
                  {
                    label: editandoModulos ? "Cancelar edición de módulos" : "Editar módulos",
                    onClick: () => {
                      setEditandoModulos((v) => !v);
                      setReseteando(false);
                    },
                  },
                  {
                    label: reseteando ? "Cancelar reseteo de contraseña" : "Resetear contraseña",
                    onClick: () => {
                      setReseteando((v) => !v);
                      setEditandoModulos(false);
                    },
                  },
                ]
              : []),
            { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: onEliminar },
          ]}
        />
      }
    >
      {editandoModulos && (
        <div className="mt-3">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {TODOS_LOS_MODULOS.map((m) => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <Checkbox checked={seleccion.has(m)} onCheckedChange={() => toggleModulo(m)} />
                {MODULO_LABELS[m]}
              </label>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={guardarModulos} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar módulos"}
          </button>
        </div>
      )}
      {reseteando && (
        <div className="mt-3">
          <ResetClaveForm perfil={perfil} actorId={ui.perfilActual?.id || null} onListo={() => setReseteando(false)} />
        </div>
      )}
    </MobileRecordCard>
  );
}
