"use client";

import { useApp } from "@/context/AppContext";
import { normPlate, planStatus } from "@/lib/helpers";
import type { Cliente } from "@/types";

const ESTADO_PRIORIDAD: Record<string, number> = { Vencido: 0, "Por vencer": 1, "Sin plan": 2, Vigente: 3 };

function coincidePatente(c: Cliente, qPatente: string): boolean {
  return qPatente.length > 0 && normPlate(c.patente).includes(qPatente);
}

function coincideNombre(c: Cliente, q: string): boolean {
  return q.length > 0 && c.nombre.toLowerCase().includes(q);
}

// Rango de relevancia: todo lo que coincide por patente se ordena antes que
// lo que solo coincide por nombre, ya que patente es el campo de búsqueda
// más específico (identifica un único vehículo/cliente).
function relevancia(c: Cliente, query: string): number {
  const nombre = c.nombre.toLowerCase();
  const q = query.toLowerCase().trim();
  const patente = normPlate(c.patente);
  const qPatente = normPlate(query);

  if (qPatente && patente === qPatente) return 0;
  if (qPatente && patente.startsWith(qPatente)) return 1;
  if (qPatente && patente.includes(qPatente)) return 2;
  if (q && nombre.startsWith(q)) return 3;
  if (q && nombre.split(" ").some((palabra) => palabra.startsWith(q))) return 4;
  if (q && nombre.includes(q)) return 5;
  return 6;
}

export default function ClientesTab() {
  const { data, ui, patchUi, commit } = useApp();
  const filtroEstado = ui.clientesFiltroEstado || "todos";
  const orden = ui.clientesOrden || "estado";

  const qPatente = normPlate(ui.search || "");
  const qNombre = (ui.search || "").toLowerCase().trim();
  let filtered = data.clientes.filter(
    (c) => !ui.search || coincidePatente(c, qPatente) || coincideNombre(c, qNombre)
  );
  if (filtroEstado !== "todos") {
    filtered = filtered.filter((c) => planStatus(c).label === filtroEstado);
  }

  const ordenColumna = (a: Cliente, b: Cliente): number => {
    switch (orden) {
      case "vencimiento_asc": {
        const va = a.vencimiento ? new Date(a.vencimiento).getTime() : Infinity;
        const vb = b.vencimiento ? new Date(b.vencimiento).getTime() : Infinity;
        return va - vb;
      }
      case "vencimiento_desc": {
        const va = a.vencimiento ? new Date(a.vencimiento).getTime() : -Infinity;
        const vb = b.vencimiento ? new Date(b.vencimiento).getTime() : -Infinity;
        return vb - va;
      }
      case "visitas_desc":
        return (b.visitas || 0) - (a.visitas || 0);
      case "visitas_asc":
        return (a.visitas || 0) - (b.visitas || 0);
      case "estado":
      default: {
        const pa = ESTADO_PRIORIDAD[planStatus(a).label] ?? 9;
        const pb = ESTADO_PRIORIDAD[planStatus(b).label] ?? 9;
        return pa - pb;
      }
    }
  };

  filtered = [...filtered].sort((a, b) => {
    if (ui.search) {
      const ra = relevancia(a, ui.search);
      const rb = relevancia(b, ui.search);
      if (ra !== rb) return ra - rb;
    }
    return ordenColumna(a, b);
  });

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
        <button className="btn ghost" onClick={() => patchUi({ modal: { type: "bulk" } })}>
          Carga masiva (Excel)
        </button>
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Patente</th>
            <th>Nombre</th>
            <th>Vehículo</th>
            <th>Origen</th>
            <th>Plan</th>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => sortHeader("vencimiento")}>
              Vencimiento{flecha("vencimiento")}
            </th>
            <th>Estado</th>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => sortHeader("visitas")}>
              Visitas{flecha("visitas")}
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="empty">No hay clientes que coincidan</div>
              </td>
            </tr>
          ) : (
            filtered.map((c, idx) => {
              const st = planStatus(c);
              return (
                <tr key={`${c.id}-${c.patente}-${idx}`}>
                  <td className="plate-tag">{c.patente}</td>
                  <td>{c.nombre}</td>
                  <td>{c.vehiculo || "-"}</td>
                  <td>{c.origen || "LOCAL"}</td>
                  <td>{c.plan || "-"}</td>
                  <td>{c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"}</td>
                  <td>
                    <span className={`status-pill ${st.cls}`}>{st.label}</span>
                  </td>
                  <td>{c.visitas || 0}</td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => patchUi({ modal: { type: "client", data: c } })}>
                      Editar
                    </button>
                    <button className="icon-btn" onClick={() => eliminar(c)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
