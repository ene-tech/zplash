"use client";

import { useCallback, useMemo, type CSSProperties } from "react";
import { useApp } from "@/context/AppContext";
import type { Cliente } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientesMobileList } from "./clientes/ClientesMobileList";
import { ClientesTable } from "./clientes/ClientesTable";
import { filtrarYOrdenarClientes } from "./clientes/filtrarOrdenarClientes";

// Los mapas value → etiqueta son también los `items` del Select: sin ellos,
// Base UI no sabe resolver la etiqueta del valor seleccionado y el trigger
// muestra el value crudo (se veía "todos" en vez de "Web y Local").
const ESTADOS: Record<string, string> = {
  todos: "Todos los estados",
  Vigente: "Vigente",
  "Por vencer": "Por vencer",
  Vencido: "Vencido",
  "Sin plan": "Sin plan",
};

const ORIGENES: Record<string, string> = {
  todos: "Web y Local",
  WEB: "Solo Web",
  LOCAL: "Solo Local",
};

// .toolbar input es flex:1 con min-width 180px (globals.css) — los dos campos
// del rango de pasadas tienen que salirse de esa regla para no comerse la
// fila entera, y un className de Tailwind no le gana en especificidad.
const CAMPO_PASADAS: CSSProperties = { flex: "0 0 auto", minWidth: 0, width: 92, textAlign: "center" };

export default function ClientesTab() {
  const { data, ui, patchUi, commit } = useApp();
  const filtroEstado = ui.clientesFiltroEstado || "todos";
  const filtroOrigen = ui.clientesFiltroOrigen || "todos";
  const pasadasDesde = ui.clientesPasadasDesde || "";
  const pasadasHasta = ui.clientesPasadasHasta || "";
  const orden = ui.clientesOrden || "estado";
  const search = ui.search || "";

  // Sin memo, esto recorría y ordenaba los 2000+ clientes desde cero en cada
  // tecla del buscador (y en cualquier otro render de este tab por una razón
  // ajena a la búsqueda) — con miles de filas es el costo dominante de cada
  // tecla tipeada.
  const filtered = useMemo(
    () => filtrarYOrdenarClientes(data.clientes, { search, filtroEstado, filtroOrigen, pasadasDesde, pasadasHasta, orden }),
    [data.clientes, search, filtroEstado, filtroOrigen, pasadasDesde, pasadasHasta, orden]
  );

  const total = data.clientes.length;
  const hayFiltro =
    Boolean(search) || filtroEstado !== "todos" || filtroOrigen !== "todos" || Boolean(pasadasDesde) || Boolean(pasadasHasta);

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
        <Select items={ESTADOS} value={filtroEstado} onValueChange={(v) => v && patchUi({ clientesFiltroEstado: v })}>
          <SelectTrigger className="w-full max-w-[170px]">
            <SelectValue className="justify-center text-center" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ESTADOS).map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={ORIGENES} value={filtroOrigen} onValueChange={(v) => v && patchUi({ clientesFiltroOrigen: v })}>
          <SelectTrigger className="w-full max-w-[150px]">
            <SelectValue className="justify-center text-center" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORIGENES).map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Pasadas</span>
          <input
            type="number"
            min={0}
            style={CAMPO_PASADAS}
            placeholder="desde"
            value={pasadasDesde}
            onChange={(e) => patchUi({ clientesPasadasDesde: e.target.value })}
          />
          <input
            type="number"
            min={0}
            style={CAMPO_PASADAS}
            placeholder="hasta"
            value={pasadasHasta}
            onChange={(e) => patchUi({ clientesPasadasHasta: e.target.value })}
          />
        </div>
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>

      <div className="mb-3 text-xs text-muted-foreground">
        {hayFiltro
          ? `${filtered.length.toLocaleString("es-CL")} de ${total.toLocaleString("es-CL")} ${total === 1 ? "cliente" : "clientes"}`
          : `${total.toLocaleString("es-CL")} ${total === 1 ? "cliente" : "clientes"}`}
      </div>

      <ClientesMobileList clientes={filtered} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
      <ClientesTable clientes={filtered} onSortHeader={sortHeader} flecha={flecha} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
    </div>
  );
}
