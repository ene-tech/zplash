"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { empresasFaltantesDesdeClientes } from "@/lib/logic";
import { fmtTelefono } from "@/lib/helpers";
import type { Empresa } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Pencil, Trash2, Building2 } from "lucide-react";

function coincide(e: Empresa, q: string): boolean {
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qRut = q.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    e.razonSocial.toLowerCase().includes(qLower) ||
    (qRut.length > 0 && e.rut.replace(/[^0-9kK]/g, "").toUpperCase().includes(qRut))
  );
}

export default function EmpresasTab() {
  const { data, ui, patchUi, commit } = useApp();

  const q = (ui.search || "").trim();
  const filtered = useMemo(
    () => data.empresas.filter((e) => coincide(e, q)).sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)),
    [data.empresas, q]
  );

  const eliminar = (e: Empresa) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar a ${e.razonSocial} (${e.rut})? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ empresas: data.empresas.filter((x) => x.id !== e.id) });
        },
      },
    });
  };

  // Backfill puntual: clientes con Factura que quedaron sin su Empresa (p. ej.
  // los importados por Excel antes de que importarClientes sincronizara
  // Empresas, ver actions.ts) — solo agrega, nunca modifica ni borra.
  const sincronizarDesdeClientes = () => {
    const faltantes = empresasFaltantesDesdeClientes(data);
    if (faltantes.length === 0) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: "Todos los clientes con Factura ya tienen su Empresa registrada.",
          confirmLabel: "Entendido",
          danger: false,
          onConfirm: () => {},
        },
      });
      return;
    }
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `Se encontraron ${faltantes.length} cliente(s) con Factura sin Empresa registrada. ¿Agregarlas a la base de Empresas?`,
        confirmLabel: "Agregar",
        danger: false,
        onConfirm: () => {
          commit({ empresas: [...data.empresas, ...faltantes] });
        },
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por razón social o RUT..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <button className="btn ghost" onClick={sincronizarDesdeClientes}>
          Sincronizar desde clientes con Factura
        </button>
        <button className="btn" onClick={() => patchUi({ modal: { type: "empresa", data: null } })}>
          + Nueva empresa
        </button>
      </div>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtered.length === 0 ? (
          <div className="empty">No hay empresas que coincidan</div>
        ) : (
          filtered.map((e) => (
            <MobileRecordCard
              key={e.id}
              avatar={<MobileRecordAvatar icon={Building2} />}
              title={e.razonSocial}
              subtitle={`${e.rut} · ${e.contactoNombre || "Sin contacto"}`}
              menu={
                <MobileRowMenu
                  actions={[
                    { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "empresa", data: e } }) },
                    { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(e) },
                  ]}
                />
              }
              meta={<MobileRecordMeta left={e.giro || "Sin giro"} right={e.telefono ? fmtTelefono(e.telefono) : undefined} />}
            />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="max-w-[180px]">Razón Social</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Giro</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">No hay empresas que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-[180px] truncate" title={e.razonSocial}>{e.razonSocial}</TableCell>
                  <TableCell>{e.rut}</TableCell>
                  <TableCell>{e.giro || "-"}</TableCell>
                  <TableCell>{e.direccion || "-"}</TableCell>
                  <TableCell>{e.telefono ? fmtTelefono(e.telefono) : "-"}</TableCell>
                  <TableCell>{e.contactoNombre || "-"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => patchUi({ modal: { type: "empresa", data: e } })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(e)}
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
