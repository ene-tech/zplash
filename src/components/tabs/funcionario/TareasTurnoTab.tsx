"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { avanceChecklist, idTareaHecha, tareasDelTurno, todayYMD, turnoDelDia, uid } from "@/lib/helpers";
import type { TareaTurno, TareaTurnoHecha, TurnoConTareas } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function TareasTurnoTab() {
  const { data, ui, commit } = useApp();
  const perfil = ui.perfilActual;
  const hoy = todayYMD();
  const puedeEditarCatalogo = perfil?.modulos.includes("perfiles") || false;

  // El turno del día decide qué checklist se abre primero; quien no tiene
  // turno asignado (o tiene uno "normal") ve el de apertura y puede cambiar.
  const turnoAsignado = perfil ? turnoDelDia(data.turnosFuncionario, perfil.id, hoy)?.turno : undefined;
  const [turno, setTurno] = useState<TurnoConTareas>(turnoAsignado === "cierre" ? "cierre" : "apertura");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [nuevaTarea, setNuevaTarea] = useState("");

  const tareas = tareasDelTurno(data.tareasTurno, turno);
  const hechaDe = (tareaId: string) =>
    data.tareasTurnoHechas.find((h) => h.id === idTareaHecha(hoy, turno, tareaId));
  const avance = avanceChecklist(data.tareasTurno, data.tareasTurnoHechas, hoy, turno);

  const historial = (() => {
    const claves = new Map<string, { fecha: string; turno: TurnoConTareas; quien: string }>();
    for (const h of data.tareasTurnoHechas) {
      const clave = `${h.fecha}|${h.turno}`;
      if (!claves.has(clave)) claves.set(clave, { fecha: h.fecha, turno: h.turno, quien: h.perfilNombre });
    }
    return [...claves.values()]
      .sort((a, b) => (a.fecha === b.fecha ? a.turno.localeCompare(b.turno) : a.fecha < b.fecha ? 1 : -1))
      .map((c) => ({ ...c, avance: avanceChecklist(data.tareasTurno, data.tareasTurnoHechas, c.fecha, c.turno) }));
  })();

  const alternar = async (tarea: TareaTurno) => {
    if (!perfil) return;
    const yaHecha = hechaDe(tarea.id);
    if (yaHecha) {
      const ok = await commit({ tareasTurnoHechas: data.tareasTurnoHechas.filter((h) => h.id !== yaHecha.id) });
      if (!ok) setErr({ msg: "No se pudo desmarcar la tarea (sin conexión).", ok: false });
      return;
    }
    const nueva: TareaTurnoHecha = {
      id: idTareaHecha(hoy, turno, tarea.id),
      fecha: hoy,
      turno,
      tareaId: tarea.id,
      perfilId: perfil.id,
      perfilNombre: perfil.nombre,
      completadoEn: new Date().toISOString(),
    };
    const ok = await commit({ tareasTurnoHechas: [...data.tareasTurnoHechas, nueva] });
    if (!ok) setErr({ msg: "No se pudo marcar la tarea (sin conexión).", ok: false });
  };

  const agregarTarea = async () => {
    const descripcion = nuevaTarea.trim();
    if (!descripcion) {
      setErr({ msg: "Escribe la tarea", ok: false });
      return;
    }
    const orden = Math.max(0, ...data.tareasTurno.filter((t) => t.turno === turno).map((t) => t.orden)) + 1;
    const nueva: TareaTurno = { id: uid(), turno, descripcion, orden, activo: true };
    const ok = await commit({ tareasTurno: [...data.tareasTurno, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar la tarea (sin conexión).", ok: false });
      return;
    }
    setNuevaTarea("");
    setErr({ msg: "Tarea agregada al checklist", ok: true });
  };

  const alternarActiva = (tarea: TareaTurno) =>
    commit({
      tareasTurno: data.tareasTurno.map((t) => (t.id === tarea.id ? { ...t, activo: !t.activo } : t)),
    });

  const borrarTarea = (tarea: TareaTurno) =>
    commit({ tareasTurno: data.tareasTurno.filter((t) => t.id !== tarea.id) });

  if (!perfil) return <div className="empty">Sesión no válida</div>;

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Checklist obligatorio del turno. Se marca en el momento en que se hace la tarea y queda registrado con tu
        nombre y la hora — solo se puede marcar el día de hoy.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant={turno === "apertura" ? "default" : "secondary"} onClick={() => setTurno("apertura")}>
          Apertura
        </Button>
        <Button variant={turno === "cierre" ? "default" : "secondary"} onClick={() => setTurno("cierre")}>
          Cierre
        </Button>
        <span style={{ color: "var(--gray)", fontSize: 13 }}>
          {hoy} · {avance.hechas} de {avance.total} tareas hechas
          {turnoAsignado === turno ? " · es tu turno asignado hoy" : ""}
        </span>
      </div>

      {tareas.length === 0 ? (
        <div className="empty">Este turno todavía no tiene tareas configuradas</div>
      ) : (
        <div>
          {tareas.map((t) => {
            const hecha = hechaDe(t.id);
            return (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={!!hecha} onChange={() => alternar(t)} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1, textDecoration: hecha ? "line-through" : undefined, opacity: hecha ? 0.6 : 1 }}>
                  {t.orden}. {t.descripcion}
                </span>
                {hecha && (
                  <span style={{ fontSize: 12, color: "var(--gray)" }}>
                    {hecha.perfilNombre} · {new Date(hecha.completadoEn).toLocaleTimeString("es-CL")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {err && (
        <div className="err" style={{ color: err.ok ? "var(--green)" : undefined, marginTop: 10 }}>
          {err.msg}
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Cumplimiento de días anteriores</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Tareas</TableHead>
              <TableHead>Marcó</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="empty">Todavía no hay checklists registrados</div>
                </TableCell>
              </TableRow>
            ) : (
              historial.map((h) => (
                <TableRow key={`${h.fecha}|${h.turno}`}>
                  <TableCell>{h.fecha}</TableCell>
                  <TableCell>{h.turno === "apertura" ? "Apertura" : "Cierre"}</TableCell>
                  <TableCell>
                    <span
                      className={`plate-tag ${h.avance.hechas >= h.avance.total ? "ok" : h.avance.hechas ? "warn" : "bad"}`}
                    >
                      {h.avance.hechas} / {h.avance.total}
                    </span>
                  </TableCell>
                  <TableCell>{h.quien}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 6 }}>
        Se muestran los últimos 90 días. El total se compara contra las tareas activas de hoy.
      </div>

      {puedeEditarCatalogo && (
        <details className="disclosure" style={{ marginTop: 26 }}>
          <summary>Configurar las tareas de {turno === "apertura" ? "apertura" : "cierre"}</summary>
          <div className="disclosure-body">
            <div className="field">
              <label>Nueva tarea</label>
              <input
                value={nuevaTarea}
                onChange={(e) => setNuevaTarea(e.target.value)}
                placeholder="Ej: Cortar matriz general de agua"
              />
            </div>
            <Button onClick={agregarTarea}>Agregar al checklist</Button>

            <div style={{ marginTop: 18 }}>
              {data.tareasTurno
                .filter((t) => t.turno === turno)
                .slice()
                .sort((a, b) => a.orden - b.orden)
                .map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                      opacity: t.activo ? 1 : 0.5,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {t.orden}. {t.descripcion}
                    </div>
                    <button className="icon-btn" onClick={() => alternarActiva(t)}>
                      {t.activo ? "Desactivar" : "Reactivar"}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Borrar"
                      aria-label="Borrar"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => borrarTarea(t)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
            </div>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 8 }}>
              Desactivar saca la tarea del checklist de hoy pero conserva el historial de cuando sí se hacía.
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
