"use client";

import { useAppUi } from "@/context/AppContext";
import { MODULO_LABELS, TODOS_LOS_MODULOS } from "@/lib/helpers";
import type { PerfilPublico } from "@/types";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2 } from "lucide-react";
import { usePerfilRowState } from "./usePerfilRowState";
import { ResetClaveForm } from "./ResetClaveForm";

export function PerfilRow({
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
    <>
      <TableRow>
        <TableCell>{perfil.nombre}</TableCell>
        <TableCell style={{ color: "var(--gray)", fontSize: 13 }}>
          {perfil.modulos.length ? perfil.modulos.map((m) => MODULO_LABELS[m]).join(", ") : "Sin módulos asignados"}
        </TableCell>
        <TableCell className="sticky right-0 z-10 bg-background">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Editar"
              aria-label="Editar"
              onClick={() => patchUi({ modal: { type: "perfil", data: perfil } })}
            >
              <Pencil />
            </Button>
            {puedeAsignarPermisos && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditandoModulos((v) => !v);
                    setReseteando(false);
                  }}
                >
                  {editandoModulos ? "Cancelar" : "Editar módulos"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReseteando((v) => !v);
                    setEditandoModulos(false);
                  }}
                >
                  {reseteando ? "Cancelar" : "Resetear contraseña"}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Eliminar"
              aria-label="Eliminar"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onEliminar}
            >
              <Trash2 />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {editandoModulos && (
        <TableRow>
          <TableCell colSpan={3}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 0" }}>
              {TODOS_LOS_MODULOS.map((m) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <Checkbox checked={seleccion.has(m)} onCheckedChange={() => toggleModulo(m)} />
                  {MODULO_LABELS[m]}
                </label>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 0 }} onClick={guardarModulos} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar módulos"}
            </button>
          </TableCell>
        </TableRow>
      )}
      {reseteando && (
        <TableRow>
          <TableCell colSpan={3}>
            <ResetClaveForm perfil={perfil} actorId={ui.perfilActual?.id || null} onListo={() => setReseteando(false)} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
