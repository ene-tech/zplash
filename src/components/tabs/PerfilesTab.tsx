"use client";

import { useApp } from "@/context/AppContext";
import { ordenarPerfiles } from "@/lib/helpers";
import type { PerfilPublico } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PerfilRow } from "@/components/tabs/perfiles/PerfilRow";
import { PerfilRowMobile } from "@/components/tabs/perfiles/PerfilRowMobile";

export default function PerfilesTab() {
  const { data, ui, commit, patchUi } = useApp();
  const puedeAsignarPermisos = ui.perfilActual?.modulos.includes("permisos") || false;

  const eliminar = (p: PerfilPublico) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar a ${p.nombre}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ perfiles: data.perfiles.filter((x) => x.id !== p.id) });
        },
      },
    });
  };

  return (
    <div>
      {puedeAsignarPermisos && (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Acá se administra cada perfil: nombre, qué módulos ve al iniciar sesión, y se puede resetear su contraseña.
        </div>
      )}
      <div className="toolbar">
        <button className="btn" onClick={() => patchUi({ modal: { type: "perfil", data: null } })}>
          + Nuevo perfil
        </button>
      </div>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {data.perfiles.length === 0 ? (
          <div className="empty">No hay perfiles registrados</div>
        ) : (
          ordenarPerfiles(data.perfiles).map((p) => (
            <PerfilRowMobile key={p.id} perfil={p} puedeAsignarPermisos={puedeAsignarPermisos} onEliminar={() => eliminar(p)} />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Módulos</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.perfiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <div className="empty">No hay perfiles registrados</div>
                </TableCell>
              </TableRow>
            ) : (
              ordenarPerfiles(data.perfiles).map((p) => (
                <PerfilRow key={p.id} perfil={p} puedeAsignarPermisos={puedeAsignarPermisos} onEliminar={() => eliminar(p)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
