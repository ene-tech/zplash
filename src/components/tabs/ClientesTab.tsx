"use client";

import { useApp } from "@/context/AppContext";
import type { Cliente } from "@/types";
import { ClientesMobileList } from "./clientes/ClientesMobileList";
import { ClientesTable } from "./clientes/ClientesTable";
import { filtrarYOrdenarClientes } from "./clientes/filtrarOrdenarClientes";

export default function ClientesTab() {
  const { data, ui, patchUi, commit } = useApp();
  const filtroEstado = ui.clientesFiltroEstado || "todos";
  const orden = ui.clientesOrden || "estado";

  const filtered = filtrarYOrdenarClientes(data.clientes, { search: ui.search || "", filtroEstado, orden });

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

  const abrirInfo = (c: Cliente) => patchUi({ modal: { type: "clienteInfo", data: c } });
  const abrirEditar = (c: Cliente) => patchUi({ modal: { type: "client", data: c } });

  const eliminar = (c: Cliente) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar a ${c.nombre} (${c.patente})? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ clientes: data.clientes.filter((x) => x.id !== c.id) });
        },
      },
    });
  };

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
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>

      <ClientesMobileList clientes={filtered} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
      <ClientesTable clientes={filtered} onSortHeader={sortHeader} flecha={flecha} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
    </div>
  );
}
