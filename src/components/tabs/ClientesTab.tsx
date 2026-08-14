"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import type { Cliente } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientesMobileList } from "./clientes/ClientesMobileList";
import { ClientesTable } from "./clientes/ClientesTable";
import { filtrarYOrdenarClientes } from "./clientes/filtrarOrdenarClientes";

export default function ClientesTab() {
  const { data, ui, patchUi, commit } = useApp();
  const filtroEstado = ui.clientesFiltroEstado || "todos";
  const filtroOrigen = ui.clientesFiltroOrigen || "todos";
  const orden = ui.clientesOrden || "estado";
  const search = ui.search || "";

  // Sin memo, esto recorría y ordenaba los 2000+ clientes desde cero en cada
  // tecla del buscador (y en cualquier otro render de este tab por una razón
  // ajena a la búsqueda) — con miles de filas es el costo dominante de cada
  // tecla tipeada.
  const filtered = useMemo(
    () => filtrarYOrdenarClientes(data.clientes, { search, filtroEstado, filtroOrigen, orden }),
    [data.clientes, search, filtroEstado, filtroOrigen, orden]
  );

  const sortHeader = (campo: "vencimiento" | "visitas") => {
    const asc = `${campo}_asc`;
    const desc = `${campo}_desc`;
    patchUi({ clientesOrden: orden === asc ? desc : asc });
  };

  const flecha = (campo: "vencimiento" | "visitas") => {
    if (orden === `${campo}_asc`) return " ▲";
    if (orden === `${campo}_desc`) return " ▼";
    return "";
  };

  // useCallback acá no es cosmético: son props de ClienteRow (memoizado, ver
  // ./clientes/ClienteRow) — si llegaran con una referencia nueva en cada
  // render (como antes), el memo de cada fila sería un no-op.
  const abrirInfo = useCallback((c: Cliente) => patchUi({ modal: { type: "clienteInfo", data: c } }), [patchUi]);
  const abrirEditar = useCallback((c: Cliente) => patchUi({ modal: { type: "client", data: c } }), [patchUi]);

  const eliminar = useCallback(
    (c: Cliente) => {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `¿Eliminar a ${c.nombre} (${c.patente})? Esta acción no se puede deshacer.`,
          onConfirm: () => {
            commit({ clientes: data.clientes.filter((x) => x.id !== c.id) });
          },
        },
      });
    },
    [data.clientes, patchUi, commit]
  );

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Buscar por nombre o patente..."
          value={ui.search || ""}
          onChange={(e) => patchUi({ search: e.target.value })}
        />
        <Select value={filtroEstado} onValueChange={(v) => v && patchUi({ clientesFiltroEstado: v })}>
          <SelectTrigger className="w-full max-w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="Vigente">Vigente</SelectItem>
            <SelectItem value="Por vencer">Por vencer</SelectItem>
            <SelectItem value="Vencido">Vencido</SelectItem>
            <SelectItem value="Sin plan">Sin plan</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroOrigen} onValueChange={(v) => v && patchUi({ clientesFiltroOrigen: v })}>
          <SelectTrigger className="w-full max-w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Web y Local</SelectItem>
            <SelectItem value="WEB">Solo Web</SelectItem>
            <SelectItem value="LOCAL">Solo Local</SelectItem>
          </SelectContent>
        </Select>
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>

      <ClientesMobileList clientes={filtered} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
      <ClientesTable clientes={filtered} onSortHeader={sortHeader} flecha={flecha} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
    </div>
  );
}
