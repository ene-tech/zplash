"use client";

import { fmtCLP, sumarDias, todayYMD } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Pencil, Trash2, Sparkles } from "lucide-react";
import { useServiciosAdicionalesLog, ESTADO_PAGO_TONE } from "@/components/serviciosLog/useServiciosAdicionalesLog";
import { StatusCell } from "@/components/serviciosLog/StatusCell";

export default function ServiciosAdicionalesLog() {
  const r = useServiciosAdicionalesLog();

  return (
    <div className="today-log">
      <h3>Servicios registrados{r.fechaLog === todayYMD() ? " hoy" : ` el ${r.fechaLog}`}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => r.setFechaLog(sumarDias(r.fechaLog, -1))}>
          ← Día anterior
        </button>
        <input type="date" value={r.fechaLog} onChange={(e) => r.setFechaLog(e.target.value)} style={{ flex: "0 0 auto" }} />
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => r.setFechaLog(sumarDias(r.fechaLog, 1))}>
          Día siguiente →
        </button>
        {r.fechaLog !== todayYMD() && (
          <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => r.setFechaLog(todayYMD())}>
            Volver a hoy
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {r.logList.length === 0 ? (
          <div className="empty">Sin servicios registrados ese día</div>
        ) : (
          r.logList.map((v) => (
            <MobileRecordCard
              key={v.id}
              hint={v.notas || undefined}
              avatar={<MobileRecordAvatar icon={Sparkles} tone={v.estadoPago ? ESTADO_PAGO_TONE[v.estadoPago] : "neutral"} />}
              title={<span className="plate-tag">{v.patente}</span>}
              subtitle={
                <>
                  {v.nombre} — {v.tipo}
                </>
              }
              menu={
                r.esGerencia && (
                  <MobileRowMenu
                    actions={[
                      { label: "Editar", icon: <Pencil />, onClick: () => r.editarServicio(v) },
                      { label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => r.eliminarServicio(v) },
                    ]}
                  />
                )
              }
              meta={
                <MobileRecordMeta
                  left={
                    <>
                      {v.estadoPago && <span className={`status-pill ${ESTADO_PAGO_TONE[v.estadoPago]}`}>{r.labelEstadoPago(v)}</span>}
                      <div className="mt-1 text-muted-foreground">{r.telefonoDe(v)}</div>
                    </>
                  }
                  right={
                    <>
                      <div className="font-medium">{fmtCLP(v.precio)}</div>
                      {v.horaEntrega && (
                        <div className="text-muted-foreground">
                          Entrega {v.fechaEntrega && v.fechaEntrega !== todayYMD() ? `${v.fechaEntrega} ` : ""}
                          {v.horaEntrega}
                        </div>
                      )}
                    </>
                  }
                />
              }
            >
              {v.citaId && (
                <div className="mt-2">
                  <StatusCell
                    key={`${v.citaId}:${r.data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}`}
                    estadoActual={r.data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}
                    onCambiar={(estado) => r.cambiarStatusCita(v.citaId!, estado)}
                  />
                </div>
              )}
            </MobileRecordCard>
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
              {r.esGerencia && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.logList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={r.esGerencia ? 8 : 7}>
                  <div className="empty">Sin servicios registrados ese día</div>
                </TableCell>
              </TableRow>
            ) : (
              r.logList.map((v) => (
                <TableRow key={v.id} title={v.notas || undefined}>
                  <TableCell className="plate-tag">{v.patente}</TableCell>
                  <TableCell>
                    {v.nombre} — {v.tipo}
                  </TableCell>
                  <TableCell>{r.telefonoDe(v)}</TableCell>
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
                        key={`${v.citaId}:${r.data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}`}
                        estadoActual={r.data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}
                        onCambiar={(estado) => r.cambiarStatusCita(v.citaId!, estado)}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtCLP(v.precio)}</TableCell>
                  {r.esGerencia && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" title="Editar" aria-label="Editar" onClick={() => r.editarServicio(v)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => r.eliminarServicio(v)}
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
