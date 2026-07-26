"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { todayYMD, uid } from "@/lib/helpers";
import type { BloqueoAgenda } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Trash2, CalendarOff } from "lucide-react";

export function BloqueosPuntuales() {
  const { data, ui, commit } = useApp();
  const fechaRef = useRef<HTMLInputElement>(null);
  const horaInicioRef = useRef<HTMLInputElement>(null);
  const horaFinRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLInputElement>(null);
  const [todoElDia, setTodoElDia] = useState(true);
  const [err, setErr] = useState("");

  const crear = async () => {
    const fecha = fechaRef.current?.value || "";
    if (!fecha) {
      setErr("Selecciona una fecha");
      return;
    }
    const horaInicio = todoElDia ? undefined : horaInicioRef.current?.value || undefined;
    const horaFin = todoElDia ? undefined : horaFinRef.current?.value || undefined;
    if (!todoElDia && (!horaInicio || !horaFin)) {
      setErr("Indica hora de inicio y fin, o marca 'Todo el día'");
      return;
    }
    setErr("");
    const nuevo: BloqueoAgenda = {
      id: uid(),
      fecha,
      todoElDia,
      horaInicio,
      horaFin,
      motivo: motivoRef.current?.value.trim() || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre,
    };
    const ok = await commit({ bloqueosAgenda: [...data.bloqueosAgenda, nuevo] });
    if (!ok) {
      setErr("No se pudo guardar (sin conexión). Intenta de nuevo.");
      return;
    }
    if (fechaRef.current) fechaRef.current.value = "";
    if (motivoRef.current) motivoRef.current.value = "";
  };

  const quitar = (id: string) => {
    commit({ bloqueosAgenda: data.bloqueosAgenda.filter((b) => b.id !== id) });
  };

  return (
    <div className="modal" style={{ maxWidth: 620, margin: "0 0 20px 0" }}>
      <h3>Bloqueos puntuales</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Bloquea un día completo o un rango de horas específico, aunque esté dentro del horario habitual.
      </div>
      <div className="field">
        <label>Fecha</label>
        <input ref={fechaRef} type="date" min={todayYMD()} />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />
          Todo el día
        </label>
      </div>
      {!todoElDia && (
        <div style={{ display: "flex", gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Desde</label>
            <input ref={horaInicioRef} type="time" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Hasta</label>
            <input ref={horaFinRef} type="time" />
          </div>
        </div>
      )}
      <div className="field">
        <label>Motivo (opcional)</label>
        <input ref={motivoRef} placeholder="Ej: Vacaciones, mantención" />
      </div>
      <div className="err">{err}</div>
      <button className="btn" onClick={crear}>
        Agregar bloqueo
      </button>

      {data.bloqueosAgenda.length > 0 && (
        <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card" style={{ marginTop: 16 }}>
          {data.bloqueosAgenda.map((b) => (
            <MobileRecordCard
              key={b.id}
              avatar={<MobileRecordAvatar icon={CalendarOff} />}
              title={b.fecha}
              subtitle={`${b.todoElDia ? "Todo el día" : `${b.horaInicio} – ${b.horaFin}`} · ${b.motivo || "Sin motivo"}`}
              menu={<MobileRowMenu actions={[{ label: "Quitar", icon: <Trash2 />, destructive: true, onClick: () => quitar(b.id) }]} />}
            />
          ))}
        </div>
      )}

      {data.bloqueosAgenda.length > 0 && (
        <div className="table-scroll hidden md:block" style={{ marginTop: 16 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="sticky right-0 z-10 w-0 bg-background" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bloqueosAgenda.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.fecha}</TableCell>
                  <TableCell>{b.todoElDia ? "Todo el día" : `${b.horaInicio} – ${b.horaFin}`}</TableCell>
                  <TableCell>{b.motivo || "-"}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Quitar"
                      aria-label="Quitar"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => quitar(b.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
