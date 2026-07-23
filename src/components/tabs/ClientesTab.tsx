"use client";

import { useApp } from "@/context/AppContext";
import { fmtTelefono, normPlate, planStatus, plateEstadoCls } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Info, Pencil, Trash2 } from "lucide-react";

const ESTADO_PRIORIDAD: Record<string, number> = { Vencido: 0, "Por vencer": 1, "Sin plan": 2, Vigente: 3 };

// Mismo criterio de color que .status-pill (ok/warn/bad), pero como punto de
// color para la fila compacta de mobile en vez del pill completo — no cabe
// un pill con padding propio en una fila tan angosta.
const ESTADO_DOT: Record<string, string> = {
  ok: "bg-[color:var(--green)]",
  warn: "bg-[color:var(--gold)]",
  bad: "bg-[color:var(--red)]",
  info: "bg-[color:var(--blue)]",
};

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
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>
      {/* Mobile: lista compacta de 2-3 líneas por fila en vez de la tabla ancha
          (que en pantallas angostas obligaba a hacer scroll horizontal para
          llegar a las acciones) — así entran muchos más registros por pantalla. */}
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {filtered.length === 0 ? (
          <div className="empty">No hay clientes que coincidan</div>
        ) : (
          filtered.map((c, idx) => {
            const st = planStatus(c);
            return (
              <div key={`${c.id}-${c.patente}-${idx}`} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{c.nombre}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <span className={`size-1.5 rounded-full ${ESTADO_DOT[plateEstadoCls(c)] || ESTADO_DOT.warn}`} />
                      {st.label}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span className={`plate-tag ${plateEstadoCls(c)}`}>{c.patente}</span> ·{" "}
                    {c.telefono ? fmtTelefono(c.telefono) : "Sin teléfono"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.plan || "Sin plan"} · {c.visitas || 0} visita{c.visitas === 1 ? "" : "s"}
                  </div>
                </div>
                <MobileRowMenu
                  actions={[
                    { label: "Información adicional", icon: <Info />, onClick: () => patchUi({ modal: { type: "clienteInfo", data: c } }) },
                    { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "client", data: c } }) },
                    { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(c) },
                  ]}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patente</TableHead>
              <TableHead className="max-w-[140px]">Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="col-mail">Mail</TableHead>
              <TableHead>Vehículo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => sortHeader("vencimiento")}>
                Vencimiento{flecha("vencimiento")}
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => sortHeader("visitas")}>
                Visitas{flecha("visitas")}
              </TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11}>
                  <div className="empty">No hay clientes que coincidan</div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c, idx) => {
                const st = planStatus(c);
                return (
                  <TableRow key={`${c.id}-${c.patente}-${idx}`}>
                    <TableCell className={`plate-tag ${plateEstadoCls(c)}`}>{c.patente}</TableCell>
                    <TableCell className="max-w-[140px] truncate" title={c.nombre}>{c.nombre}</TableCell>
                    <TableCell>{c.telefono ? fmtTelefono(c.telefono) : "-"}</TableCell>
                    <TableCell className="col-mail" title={c.email || ""}>{c.email || "-"}</TableCell>
                    <TableCell>{c.vehiculo || "-"}</TableCell>
                    <TableCell>{c.origen || "LOCAL"}</TableCell>
                    <TableCell>{c.plan || "-"}</TableCell>
                    <TableCell>{c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"}</TableCell>
                    <TableCell>
                      <span className={`status-pill ${st.cls}`}>{st.label}</span>
                    </TableCell>
                    <TableCell>{c.visitas || 0}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Información adicional"
                          aria-label="Información adicional"
                          onClick={() => patchUi({ modal: { type: "clienteInfo", data: c } })}
                        >
                          <Info />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Editar"
                          aria-label="Editar"
                          onClick={() => patchUi({ modal: { type: "client", data: c } })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => eliminar(c)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
