"use client";

import { useApp } from "@/context/AppContext";
import { fmtTelefono, normPlate, planProgreso, planStatus, plateEstadoCls } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta } from "@/components/MobileRecordCard";
import { ArrowLeftRight, Info, Pencil, Trash2 } from "lucide-react";

// Indicador visual de que el cliente tiene una solicitud de cambio de
// patente pendiente (ver ClientModal → SolicitudCambioPatenteAdmin): se
// aplicará recién cuando el plan renueve a un período nuevo, ver
// resolverPatentePendiente en @/lib/helpers.
function IconoCambioPatentePendiente({ patentePendiente }: { patentePendiente: string }) {
  return (
    <span
      className="inline-flex shrink-0"
      title={`Cambio de patente pendiente a ${patentePendiente}`}
      aria-label={`Cambio de patente pendiente a ${patentePendiente}`}
    >
      <ArrowLeftRight size={13} style={{ color: "var(--blue)" }} />
    </span>
  );
}

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
        <button className="btn" onClick={() => patchUi({ modal: { type: "client", data: null } })}>
          + Nuevo cliente
        </button>
      </div>
      {/* Mobile: lista compacta de 2-3 líneas por fila en vez de la tabla ancha
          (que en pantallas angostas obligaba a hacer scroll horizontal para
          llegar a las acciones) — así entran muchos más registros por pantalla. */}
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {filtered.length === 0 ? (
          <div className="empty">No hay clientes que coincidan</div>
        ) : (
          filtered.map((c, idx) => {
            const st = planStatus(c);
            const prog = planProgreso(c);
            return (
              <MobileRecordCard
                key={`${c.id}-${c.patente}-${idx}`}
                title={<span className="mt-1.5 ml-1 block">{c.nombre}</span>}
                subtitle={
                  <>
                    <span className={`plate-tag ${plateEstadoCls(c)}`}>{c.patente}</span>{" "}
                    {c.patentePendiente && <IconoCambioPatentePendiente patentePendiente={c.patentePendiente} />} ·{" "}
                    {c.telefono ? fmtTelefono(c.telefono) : "Sin teléfono"}
                  </>
                }
                menu={
                  <MobileRowMenu
                    actions={[
                      { label: "Información adicional", icon: <Info />, onClick: () => patchUi({ modal: { type: "clienteInfo", data: c } }) },
                      { label: "Editar", icon: <Pencil />, onClick: () => patchUi({ modal: { type: "client", data: c } }) },
                      { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(c) },
                    ]}
                  />
                }
                meta={
                  <MobileRecordMeta
                    left={<span className={`status-pill ${st.cls}`}>{st.label}</span>}
                    right={
                      <>
                        <div className="font-medium">{c.plan || "Sin plan"}</div>
                        <div className="text-muted-foreground">
                          {c.visitas || 0} visita{c.visitas === 1 ? "" : "s"}
                        </div>
                      </>
                    }
                  />
                }
              >
                {prog !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">Plan</span>
                    <ProgressBar value={prog} tone={st.cls} className="flex-1" />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{prog}%</span>
                  </div>
                )}
              </MobileRecordCard>
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
                const prog = planProgreso(c);
                return (
                  <TableRow key={`${c.id}-${c.patente}-${idx}`}>
                    <TableCell className={`plate-tag ${plateEstadoCls(c)}`}>
                      <span className="inline-flex items-center gap-1">
                        {c.patente}
                        {c.patentePendiente && <IconoCambioPatentePendiente patentePendiente={c.patentePendiente} />}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate" title={c.nombre}>{c.nombre}</TableCell>
                    <TableCell>{c.telefono ? fmtTelefono(c.telefono) : "-"}</TableCell>
                    <TableCell className="col-mail" title={c.email || ""}>{c.email || "-"}</TableCell>
                    <TableCell>{c.vehiculo || "-"}</TableCell>
                    <TableCell>{c.origen || "LOCAL"}</TableCell>
                    <TableCell>{c.plan || "-"}</TableCell>
                    <TableCell>
                      <div>{c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"}</div>
                      {prog !== null && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <ProgressBar value={prog} tone={st.cls} className="w-16" />
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{prog}%</span>
                        </div>
                      )}
                    </TableCell>
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
