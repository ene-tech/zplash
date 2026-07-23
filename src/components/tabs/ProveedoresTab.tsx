"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { fmtTelefono } from "@/lib/helpers";
import type { Proveedor } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Pencil, Trash2 } from "lucide-react";

export default function ProveedoresTab() {
  const { data, ui, patchUi, commit } = useApp();

  const q = (ui.search || "").trim().toLowerCase();
  const filtrados = useMemo(() => {
    return data.proveedores
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || (p.rut || "").toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data.proveedores, q]);

  const eliminar = (p: Proveedor) => {
    const enUso = data.productos.some((prod) => prod.proveedorId === p.id);
    patchUi({
      modal: {
        type: "confirm",
        mensaje: enUso
          ? `¿Eliminar a ${p.nombre}? Los productos que lo tienen asignado quedarán sin proveedor.`
          : `¿Eliminar a ${p.nombre}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ proveedores: data.proveedores.filter((x) => x.id !== p.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input placeholder="Buscar por nombre o RUT..." value={ui.search || ""} onChange={(e) => patchUi({ search: e.target.value })} />
        <button className="btn" onClick={() => patchUi({ modal: { type: "proveedor", data: null } })}>
          + Nuevo proveedor
        </button>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {filtrados.length === 0 ? (
          <div className="empty">No hay proveedores que coincidan</div>
        ) : (
          filtrados.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.nombre}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.rut || "Sin RUT"} · {p.telefono ? fmtTelefono(p.telefono) : "Sin teléfono"}
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.email || p.contacto || "-"}</div>
              </div>
              <MobileRowMenu
                actions={[
                  { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "proveedor", data: p } }) },
                  { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(p) },
                ]}
              />
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-w-[160px]">Nombre</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">No hay proveedores que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[160px] truncate" title={p.nombre}>{p.nombre}</TableCell>
                  <TableCell>{p.rut || "-"}</TableCell>
                  <TableCell>{p.telefono ? fmtTelefono(p.telefono) : "-"}</TableCell>
                  <TableCell>{p.email || "-"}</TableCell>
                  <TableCell>{p.direccion || "-"}</TableCell>
                  <TableCell>{p.contacto || "-"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => patchUi({ modal: { type: "proveedor", data: p } })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(p)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
