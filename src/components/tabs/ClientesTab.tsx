"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useApp } from "@/context/AppContext";
import { normPlate } from "@/lib/helpers";
import { listarSuscripcionesOneclick } from "@/lib/serverActions";
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

// Los values son las etiquetas que muestra la columna "Suscripción"
// (estadoRenovacion, ver @/lib/helpers/oneclick); "Sin RA" agrupa
// "Web sin RA" y "Local sin RA".
const SUSCRIPCIONES: Record<string, string> = {
  todas: "Todas las suscripciones",
  "Renovación automática": "Renovación automática",
  "RA WOO": "RA WOO",
  "Cancelada desde admin": "Cancelada desde admin",
  Cancelada: "Cancelada",
  "Sin RA": "Sin RA",
};

// .toolbar input es flex:1 con min-width 180px (globals.css) — los dos campos
// del rango de pasadas tienen que salirse de esa regla para no comerse la
// fila entera, y un className de Tailwind no le gana en especificidad.
const CAMPO_PASADAS: CSSProperties = { flex: "0 0 auto", minWidth: 0, width: 92, textAlign: "center" };

export default function ClientesTab() {
  const { data, ui, patchUi, commit } = useApp();
  const filtroEstado = ui.clientesFiltroEstado || "todos";
  const filtroOrigen = ui.clientesFiltroOrigen || "todos";
  const filtroSuscripcion = ui.clientesFiltroSuscripcion || "todas";
  const filtroPlan = ui.clientesFiltroPlan || "todos";
  const pasadasDesde = ui.clientesPasadasDesde || "";
  const pasadasHasta = ui.clientesPasadasHasta || "";
  const orden = ui.clientesOrden || "estado";
  const search = ui.search || "";

  // Las suscripciones Oneclick no viven en AppData/commit() (mismo criterio que
  // SuscripcionesTab y Correos Únicos): se piden una vez al montar y se indexan
  // por patente para la columna "Suscripción". Se queda con la PRIMERA fila de
  // cada patente porque el listado ya viene ordenado por estado (activa <
  // suspendida < pendiente < cancelada) — quien canceló y volvió a inscribir
  // tiene más de una fila, y la que manda es la viva.
  const [suscripciones, setSuscripciones] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let cancelado = false;
    listarSuscripcionesOneclick().then((filas) => {
      if (cancelado) return;
      const porPatente = new Map<string, string>();
      for (const s of filas) {
        const key = normPlate(s.patente);
        if (!porPatente.has(key)) porPatente.set(key, s.estado);
      }
      setSuscripciones(porPatente);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Sin memo, esto recorría y ordenaba los 2000+ clientes desde cero en cada
  // tecla del buscador (y en cualquier otro render de este tab por una razón
  // ajena a la búsqueda) — con miles de filas es el costo dominante de cada
  // tecla tipeada.
  const filtered = useMemo(
    () =>
      filtrarYOrdenarClientes(data.clientes, {
        search,
        filtroEstado,
        filtroOrigen,
        filtroSuscripcion,
        filtroPlan,
        suscripciones,
        pasadasDesde,
        pasadasHasta,
        orden,
      }),
    [data.clientes, search, filtroEstado, filtroOrigen, filtroSuscripcion, filtroPlan, suscripciones, pasadasDesde, pasadasHasta, orden]
  );

  // Un value por plan presente en la base; "-" agrupa a los sin plan (mismo
  // fallback que muestra la columna).
  const PLANES = useMemo(() => {
    const items: Record<string, string> = { todos: "Todos los planes" };
    for (const p of [...new Set(data.clientes.map((c) => c.plan || "-"))].sort()) {
      items[p] = p === "-" ? "Sin plan asignado" : p;
    }
    return items;
  }, [data.clientes]);

  const total = data.clientes.length;
  const hayFiltro =
    Boolean(search) ||
    filtroEstado !== "todos" ||
    filtroOrigen !== "todos" ||
    filtroSuscripcion !== "todas" ||
    filtroPlan !== "todos" ||
    Boolean(pasadasDesde) ||
    Boolean(pasadasHasta);

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
        <Select items={PLANES} value={filtroPlan} onValueChange={(v) => v && patchUi({ clientesFiltroPlan: v })}>
          <SelectTrigger className="w-full max-w-[170px]">
            <SelectValue className="justify-center text-center" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PLANES).map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={SUSCRIPCIONES} value={filtroSuscripcion} onValueChange={(v) => v && patchUi({ clientesFiltroSuscripcion: v })}>
          <SelectTrigger className="w-full max-w-[200px]">
            <SelectValue className="justify-center text-center" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SUSCRIPCIONES).map(([valor, etiqueta]) => (
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

      <ClientesMobileList clientes={filtered} suscripciones={suscripciones} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
      <ClientesTable clientes={filtered} suscripciones={suscripciones} onSortHeader={sortHeader} flecha={flecha} onInfo={abrirInfo} onEditar={abrirEditar} onEliminar={eliminar} />
    </div>
  );
}
