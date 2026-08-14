"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import type { Cliente } from "@/types";
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
        <select
          style={{ maxWidth: 170 }}
          value={filtroEstado}
          onChange={(e) => patchUi({ clientesFiltroEstado: e.target.value })}
        >
          <option value="todos">Todos los estados</option>
          <option value="Vigente">Vigente</option>
          <option value="Por vencer">Por vencer</option>
          <option value="Vencido">Vencido</option>
          <option value="Sin plan">Sin plan</option>
        </select>
        <select
          style={{ maxWidth: 150 }}
          value={filtroOrigen}
          onChange={(e) => patchUi({ clientesFiltroOrigen: e.target.value })}
        >
          <option value="todos">Web y Local</option>
          <option value="WEB">Solo Web</option>
          <option value="LOCAL">Solo Local</option>
        </select>
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>

      <ClientesMobileList clientes={filtered} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
      <ClientesTable clientes={filtered} onSortHeader={sortHeader} flecha={flecha} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
    </div>
  );
}
