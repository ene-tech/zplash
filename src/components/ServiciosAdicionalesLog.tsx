"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ESTADOS_CITA, esEstadoFinal, esRetrocesoInvalido } from "@/lib/agenda";
import { fmtCLP, fmtTelefono, sumarDias, todayYMD, ymd } from "@/lib/helpers";
import type { Cita, Venta } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Pencil, Trash2 } from "lucide-react";

export default function ServiciosAdicionalesLog() {
  const { data, ui, commit, patchUi } = useApp();
  const [fechaLog, setFechaLog] = useState(todayYMD());

  const logList = data.ventas.filter((v) => v.esServicioAdicional && ymd(new Date(v.fecha)) === fechaLog);

  // Solo Gerencia (módulo "permisos", mismo criterio que PerfilesTab) puede
  // borrar o editar un servicio ya registrado: borrar es destructivo y
  // además elimina el pago Transbank asociado, si tuvo uno (ver deleteVentas
  // en dataAccess.ts); editar corrige datos ya guardados sin pasar por el
  // circuito normal de registro.
  const esGerencia = ui.perfilActual?.modulos.includes("permisos") || false;

  // El teléfono no vive en la Venta: se busca en la ficha del cliente y, si
  // no hay clienteId (venta sin cliente registrado), se cae al teléfono
  // guardado en la Cita creada junto con este servicio.
  const telefonoDe = (v: Venta) => {
    const cliente = v.clienteId ? data.clientes.find((c) => c.id === v.clienteId) : undefined;
    const telefono = cliente?.telefono || data.citas.find((c) => c.id === v.citaId)?.telefono;
    return telefono ? fmtTelefono(telefono) : "—";
  };

  const editarServicio = (v: Venta) => {
    patchUi({ modal: { type: "servicioAdicional", data: v } });
  };

  const eliminarServicio = (v: Venta) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el servicio de ${v.patente} (${v.nombre})? Esta acción no se puede deshacer y también elimina el pago asociado, si existe.`,
        onConfirm: () => {
          commit({ ventas: data.ventas.filter((x) => x.id !== v.id) });
        },
      },
    });
  };

  // Al retirar el vehículo (último paso del circuito) se cobra cualquier
  // saldo pendiente de las ventas ligadas a esa cita antes de aplicar el
  // cambio de status: si ya estaba todo pagado, se aplica directo.
  const cambiarStatusCita = (citaId: string, estado: Cita["estado"]) => {
    if (estado === "retirado") {
      const ventasCita = data.ventas.filter((v) => v.citaId === citaId);
      const totalPrecio = ventasCita.reduce((s, v) => s + v.precio, 0);
      const totalCobrado = ventasCita.reduce((s, v) => s + (v.montoCobrado ?? 0), 0);
      const saldo = totalPrecio - totalCobrado;
      if (saldo > 0) {
        patchUi({
          modal: {
            type: "pago",
            monto: saldo,
            descripcion: `Saldo pendiente — ${ventasCita[0]?.patente || ""}`,
            onConfirm: (pago) => {
              commit({
                ventas: data.ventas.map((v) =>
                  v.citaId === citaId ? { ...v, estadoPago: "pagado", montoCobrado: v.precio, metodoPago: pago.metodo } : v
                ),
                citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)),
              });
            },
          },
        });
        return;
      }
    }
    commit({ citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)) });
  };

  return (
    <div className="today-log">
      <h3>Servicios registrados{fechaLog === todayYMD() ? " hoy" : ` el ${fechaLog}`}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(sumarDias(fechaLog, -1))}>
          ← Día anterior
        </button>
        <input type="date" value={fechaLog} onChange={(e) => setFechaLog(e.target.value)} style={{ flex: "0 0 auto" }} />
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(sumarDias(fechaLog, 1))}>
          Día siguiente →
        </button>
        {fechaLog !== todayYMD() && (
          <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(todayYMD())}>
            Volver a hoy
          </button>
        )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {logList.length === 0 ? (
          <div className="empty">Sin servicios registrados ese día</div>
        ) : (
          logList.map((v) => (
            <div key={v.id} className="p-3" title={v.notas || undefined}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="plate-tag truncate">{v.patente}</span>
                    {v.estadoPago && (
                      <span
                        className={`status-pill ${v.estadoPago === "pagado" ? "ok" : v.estadoPago === "abono50" ? "warn" : "bad"}`}
                      >
                        {v.estadoPago === "pagado"
                          ? "Pagado"
                          : v.estadoPago === "abono50"
                            ? `Abono ${fmtCLP(v.montoCobrado ?? 0)}`
                            : "Por pagar"}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {v.nombre} — {v.tipo}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {telefonoDe(v)} · {fmtCLP(v.precio)}
                    {v.horaEntrega
                      ? ` · Entrega ${v.fechaEntrega && v.fechaEntrega !== todayYMD() ? `${v.fechaEntrega} ` : ""}${v.horaEntrega}`
                      : ""}
                  </div>
                </div>
                {esGerencia && (
                  <MobileRowMenu
                    actions={[
                      { label: "Editar", icon: <Pencil />, onClick: () => editarServicio(v) },
                      { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarServicio(v) },
                    ]}
                  />
                )}
              </div>
              {v.citaId && (
                <div className="mt-2">
                  <StatusCell
                    key={`${v.citaId}:${data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}`}
                    estadoActual={data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}
                    onCambiar={(estado) => cambiarStatusCita(v.citaId!, estado)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patente</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Precio</TableHead>
              {esGerencia && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {logList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={esGerencia ? 8 : 7}>
                  <div className="empty">Sin servicios registrados ese día</div>
                </TableCell>
              </TableRow>
            ) : (
              logList.map((v) => (
                <TableRow key={v.id} title={v.notas || undefined}>
                  <TableCell className="plate-tag">{v.patente}</TableCell>
                  <TableCell>
                    {v.nombre} — {v.tipo}
                  </TableCell>
                  <TableCell>{telefonoDe(v)}</TableCell>
                  <TableCell>
                    {v.estadoPago && (
                      <span
                        className={`status-pill ${v.estadoPago === "pagado" ? "ok" : v.estadoPago === "abono50" ? "warn" : "bad"}`}
                      >
                        {v.estadoPago === "pagado"
                          ? "Pagado"
                          : v.estadoPago === "abono50"
                          ? `Abono ${fmtCLP(v.montoCobrado ?? 0)}`
                          : "Por pagar"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.horaEntrega
                      ? `${v.fechaEntrega && v.fechaEntrega !== todayYMD() ? `${v.fechaEntrega} ` : ""}${v.horaEntrega}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {v.citaId ? (
                      <StatusCell
                        // Fuerza a remontar (y así resetear la selección local al
                        // valor real) cuando el estado de la cita cambia por fuera
                        // de este control, en vez de sincronizar con un efecto.
                        key={`${v.citaId}:${data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}`}
                        estadoActual={data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}
                        onCambiar={(estado) => cambiarStatusCita(v.citaId!, estado)}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtCLP(v.precio)}</TableCell>
                  {esGerencia && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" title="Editar" aria-label="Editar" onClick={() => editarServicio(v)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => eliminarServicio(v)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Selector + botón "Cambiar" en vez de aplicar al vuelo con onChange: así el
// cambio de status (incluido el cobro de saldo al pasar a "Retirado") solo
// ocurre cuando el usuario confirma, no con un clic accidental en el select.
function StatusCell({
  estadoActual,
  onCambiar,
}: {
  estadoActual: Cita["estado"];
  onCambiar: (estado: Cita["estado"]) => void;
}) {
  // No hay un useEffect que resincronice `seleccion` con `estadoActual`: el
  // padre remonta este componente (ver el `key` en el llamador) cada vez que
  // el estado real de la cita cambia por fuera de este control, así que el
  // valor inicial de useState ya queda al día solo.
  const [seleccion, setSeleccion] = useState<Cita["estado"]>(estadoActual);
  const bloqueado = esEstadoFinal(estadoActual);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value as Cita["estado"])}
        disabled={bloqueado}
        style={{ fontSize: 13 }}
      >
        {ESTADOS_CITA.map((e) => (
          <option key={e.valor} value={e.valor} disabled={esRetrocesoInvalido(estadoActual, e.valor)}>
            {e.label}
          </option>
        ))}
      </select>
      {!bloqueado && (
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "4px 10px", fontSize: 12 }}
          disabled={seleccion === estadoActual}
          onClick={() => onCambiar(seleccion)}
        >
          Cambiar
        </button>
      )}
    </div>
  );
}
