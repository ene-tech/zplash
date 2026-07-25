"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { alertaMantencionStatus, fmtFecha, sumarMeses, todayYMD, uid, vehiculosDesdeUltimaMantencion } from "@/lib/helpers";
import type { AlertaMantencion, RegistroMantencion } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { CalendarClock, CheckCircle2, Trash2, XCircle } from "lucide-react";

const ATAJOS_MESES = [1, 3, 6, 12];

export default function AlertasMantencionTab() {
  const { data, ui, patchUi, commit } = useApp();
  const maquinariasActivas = data.maquinarias.filter((m) => m.activo);

  const [maquinariaId, setMaquinariaId] = useState(maquinariasActivas[0]?.id || "");
  const [descripcion, setDescripcion] = useState("");
  const [fechaObjetivo, setFechaObjetivo] = useState(todayYMD());
  const [notas, setNotas] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const [completandoId, setCompletandoId] = useState<string | null>(null);
  const [responsableCompletar, setResponsableCompletar] = useState(ui.perfilActual?.nombre || "");
  const [costoCompletarTexto, setCostoCompletarTexto] = useState("");

  const maquinariaNombre = (id: string) => data.maquinarias.find((m) => m.id === id)?.nombre || "(máquina eliminada)";

  const pendientes = useMemo(
    () =>
      data.alertasMantencion
        .filter((a) => a.estado === "pendiente")
        .slice()
        .sort((a, b) => (a.fechaObjetivo < b.fechaObjetivo ? -1 : 1)),
    [data.alertasMantencion]
  );
  const historial = useMemo(
    () =>
      data.alertasMantencion
        .filter((a) => a.estado !== "pendiente")
        .slice()
        .sort((a, b) => (a.fechaObjetivo < b.fechaObjetivo ? 1 : -1)),
    [data.alertasMantencion]
  );

  const completando = completandoId ? data.alertasMantencion.find((a) => a.id === completandoId) || null : null;

  const limpiar = () => {
    setDescripcion("");
    setFechaObjetivo(todayYMD());
    setNotas("");
  };

  const agendar = async () => {
    if (!maquinariaId) {
      setErr({ msg: "Selecciona una máquina", ok: false });
      return;
    }
    if (!descripcion.trim()) {
      setErr({ msg: "Describe la mantención a agendar", ok: false });
      return;
    }
    if (!fechaObjetivo) {
      setErr({ msg: "Elige la fecha objetivo", ok: false });
      return;
    }
    const nueva: AlertaMantencion = {
      id: uid(),
      maquinariaId,
      descripcion: descripcion.trim(),
      fechaObjetivo,
      estado: "pendiente",
      notas: notas.trim() || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || undefined,
    };
    const ok = await commit({ alertasMantencion: [...data.alertasMantencion, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar la alerta (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Alerta agendada para "${maquinariaNombre(maquinariaId)}".`, ok: true });
    limpiar();
  };

  const iniciarCompletar = (alerta: AlertaMantencion) => {
    setCompletandoId(alerta.id);
    setResponsableCompletar(ui.perfilActual?.nombre || "");
    setCostoCompletarTexto("");
  };

  const confirmarCompletar = async () => {
    if (!completando) return;
    const maquinaria = data.maquinarias.find((m) => m.id === completando.maquinariaId);
    if (!maquinaria) {
      setErr({ msg: "La máquina de esta alerta ya no existe", ok: false });
      return;
    }
    const costo = costoCompletarTexto.trim() ? Number(costoCompletarTexto) : undefined;
    if (costoCompletarTexto.trim() && (Number.isNaN(costo) || (costo as number) < 0)) {
      setErr({ msg: "El costo debe ser un número válido", ok: false });
      return;
    }

    const fecha = new Date().toISOString();
    const registro: RegistroMantencion = {
      id: uid(),
      maquinariaId: completando.maquinariaId,
      fecha,
      descripcion: completando.descripcion,
      responsable: responsableCompletar.trim() || undefined,
      costo,
      vehiculosDesdeUltima: vehiculosDesdeUltimaMantencion(maquinaria, data.registrosMantencion, data.ingresos, fecha),
      notas: completando.notas,
      creadoPor: ui.perfilActual?.nombre || undefined,
    };
    const actualizada: AlertaMantencion = {
      ...completando,
      estado: "completada",
      completadoEn: fecha,
      registroMantencionId: registro.id,
    };
    const ok = await commit({
      registrosMantencion: [...data.registrosMantencion, registro],
      alertasMantencion: data.alertasMantencion.map((a) => (a.id === completando.id ? actualizada : a)),
    });
    if (!ok) {
      setErr({ msg: "No se pudo registrar la mantención (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Mantención de "${maquinariaNombre(completando.maquinariaId)}" registrada.`, ok: true });
    setCompletandoId(null);
  };

  const cancelarAlerta = (alerta: AlertaMantencion) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la alerta "${alerta.descripcion}" de "${maquinariaNombre(alerta.maquinariaId)}"? Quedará en el historial como cancelada.`,
        confirmLabel: "Cancelar alerta",
        onConfirm: () => {
          commit({
            alertasMantencion: data.alertasMantencion.map((a) =>
              a.id === alerta.id ? { ...a, estado: "cancelada" as const } : a
            ),
          });
        },
      },
    });
  };

  const eliminarAlerta = (alerta: AlertaMantencion) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar del historial la alerta "${alerta.descripcion}" de "${maquinariaNombre(alerta.maquinariaId)}"? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => {
          commit({ alertasMantencion: data.alertasMantencion.filter((a) => a.id !== alerta.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Agenda avisos de mantenciones futuras aunque la máquina no tenga periodicidad configurada (ej. &quot;Aseo
        general aire acondicionado&quot; en 8 meses). Cuando se realice, márcala como realizada para que quede en el
        historial de la máquina.
      </div>

      {maquinariasActivas.length === 0 ? (
        <div className="empty">Agrega una máquina activa en la pestaña Máquinas antes de agendar una alerta</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label>Máquina</label>
              <select value={maquinariaId} onChange={(e) => setMaquinariaId(e.target.value)}>
                {maquinariasActivas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label>Descripción</label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Aseo general aire acondicionado"
              />
            </div>
          </div>

          <div className="field">
            <label>Fecha objetivo</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)} />
              {ATAJOS_MESES.map((meses) => (
                <button
                  key={meses}
                  type="button"
                  className="btn ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setFechaObjetivo(sumarMeses(todayYMD(), meses))}
                >
                  +{meses} {meses === 1 ? "mes" : "meses"}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalles adicionales" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={limpiar}>
              Limpiar
            </button>
            <button className="btn" onClick={agendar}>
              Agendar alerta
            </button>
          </div>
          <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
            {err?.msg || ""}
          </div>
        </>
      )}

      {completando && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            Registrar mantención realizada: {completando.descripcion} ({maquinariaNombre(completando.maquinariaId)})
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 200, flex: 1 }}>
              <label>Responsable</label>
              <input value={responsableCompletar} onChange={(e) => setResponsableCompletar(e.target.value)} />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Costo (opcional)</label>
              <input
                type="number"
                min={0}
                value={costoCompletarTexto}
                onChange={(e) => setCostoCompletarTexto(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setCompletandoId(null)}>
              Cancelar
            </button>
            <button className="btn" onClick={confirmarCompletar}>
              Confirmar mantención realizada
            </button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Próximas alertas</h3>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {pendientes.length === 0 ? (
          <div className="empty">No hay alertas de mantención pendientes</div>
        ) : (
          pendientes.map((a) => {
            const status = alertaMantencionStatus(a);
            return (
              <MobileRecordCard
                key={a.id}
                avatar={<MobileRecordAvatar icon={CalendarClock} tone={status.cls} />}
                title={a.descripcion}
                subtitle={maquinariaNombre(a.maquinariaId)}
                menu={
                  <MobileRowMenu
                    actions={[
                      { label: "Marcar realizada", icon: <CheckCircle2 />, onClick: () => iniciarCompletar(a) },
                      { label: "Cancelar alerta", icon: <XCircle />, destructive: true, onClick: () => cancelarAlerta(a) },
                    ]}
                  />
                }
                meta={
                  <MobileRecordMeta
                    left={fmtFecha(a.fechaObjetivo)}
                    right={<span className={`status-pill ${status.cls}`}>{status.label}</span>}
                  />
                }
              />
            );
          })
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha objetivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead className="max-w-[220px]">Descripción</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="empty">No hay alertas de mantención pendientes</div>
                </TableCell>
              </TableRow>
            ) : (
              pendientes.map((a) => {
                const status = alertaMantencionStatus(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{fmtFecha(a.fechaObjetivo)}</TableCell>
                    <TableCell>
                      <span className={`status-pill ${status.cls}`}>{status.label}</span>
                    </TableCell>
                    <TableCell>{maquinariaNombre(a.maquinariaId)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={a.descripcion}>
                      {a.descripcion}
                    </TableCell>
                    <TableCell>{a.notas || "-"}</TableCell>
                    <TableCell className="sticky right-0 z-10 flex gap-1 bg-background">
                      <Button variant="ghost" size="icon-sm" title="Marcar realizada" aria-label="Marcar realizada" onClick={() => iniciarCompletar(a)}>
                        <CheckCircle2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Cancelar alerta"
                        aria-label="Cancelar alerta"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => cancelarAlerta(a)}
                      >
                        <XCircle />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {historial.length > 0 && (
        <>
          <h3 style={{ marginTop: 28 }}>Historial de alertas</h3>
          <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
            {historial.map((a) => (
              <MobileRecordCard
                key={a.id}
                avatar={<MobileRecordAvatar icon={CalendarClock} tone={a.estado === "completada" ? "ok" : "neutral"} />}
                title={a.descripcion}
                subtitle={maquinariaNombre(a.maquinariaId)}
                menu={
                  puedeBorrar && (
                    <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarAlerta(a) }]} />
                  )
                }
                meta={
                  <MobileRecordMeta
                    left={fmtFecha(a.fechaObjetivo)}
                    right={a.estado === "completada" ? "Completada" : "Cancelada"}
                  />
                }
              />
            ))}
          </div>
          <div className="table-scroll hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha objetivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead className="max-w-[220px]">Descripción</TableHead>
                  {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{fmtFecha(a.fechaObjetivo)}</TableCell>
                    <TableCell>{a.estado === "completada" ? "Completada" : "Cancelada"}</TableCell>
                    <TableCell>{maquinariaNombre(a.maquinariaId)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={a.descripcion}>
                      {a.descripcion}
                    </TableCell>
                    {puedeBorrar && (
                      <TableCell className="sticky right-0 z-10 bg-background">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Eliminar"
                          aria-label="Eliminar"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => eliminarAlerta(a)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
