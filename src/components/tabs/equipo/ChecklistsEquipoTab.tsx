"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  avanceChecklist,
  conTramo,
  DIAS_ORDEN,
  DIAS_SEMANA,
  encargadoDeZona,
  esAdministracionOGerencia,
  idTurnoFuncionario,
  labelTurnoZona,
  motivoFueraDeRegla,
  perfilesDelEquipo,
  TURNOS_ZONA,
  uid,
} from "@/lib/helpers";
import type { TareaTurno, TurnoConTareas, TurnoFuncionario, ZonaTurno } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

/** Configuración de la apertura y el cierre del local: quién es el encargado
 * de cada zona cada día, qué tareas trae cada checklist y cómo se viene
 * cumpliendo. El funcionario solo ve, en Mi Entorno, el checklist de la zona
 * que le tocó ese día. */
export default function ChecklistsEquipoTab() {
  const { data, ui, commit } = useApp();
  // Repartir las zonas y el horario con que se abre y se cierra el local es
  // decisión de quien administra al equipo, no de cualquiera con "perfiles"
  // (mismo criterio que el backstop de upsertTurnosFuncionario).
  const puedeConfigurar = esAdministracionOGerencia(ui.perfilActual?.nombre);
  const nombreDe = (perfilId?: string) => data.perfiles.find((p) => p.id === perfilId)?.nombre;
  const funcionarios = perfilesDelEquipo(data.perfiles);

  const [checklist, setChecklist] = useState(0);
  const { turno, zona, label } = TURNOS_ZONA[checklist];
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [cfgPerfilId, setCfgPerfilId] = useState("");
  const [cfgDia, setCfgDia] = useState(1);
  const [cfgRol, setCfgRol] = useState(0);
  const [cfgInicio, setCfgInicio] = useState("08:30");
  const [cfgFin, setCfgFin] = useState("17:00");

  const historial = (() => {
    const claves = new Map<string, { fecha: string; turno: TurnoConTareas; zona: ZonaTurno; quien: string }>();
    for (const h of data.tareasTurnoHechas) {
      const clave = `${h.fecha}|${h.turno}|${h.zona}`;
      if (!claves.has(clave))
        claves.set(clave, { fecha: h.fecha, turno: h.turno, zona: h.zona, quien: h.perfilNombre });
    }
    return [...claves.values()]
      .sort((a, b) =>
        a.fecha === b.fecha
          ? labelTurnoZona(a.turno, a.zona).localeCompare(labelTurnoZona(b.turno, b.zona))
          : a.fecha < b.fecha
            ? 1
            : -1
      )
      .map((c) => ({
        ...c,
        avance: avanceChecklist(data.tareasTurno, data.tareasTurnoHechas, c.fecha, c.turno, c.zona),
      }));
  })();

  /** Asignar una zona escribe el tramo de horario de esa persona ese día (id
   * determinista por perfil, día y hora de entrada) y se la quita a quien la
   * tuviera: cada zona tiene un solo encargado por turno y día. Al anterior le
   * queda su horario, ya sin zona. Si la persona ya tenía otro tramo ese día
   * que no se pisa con este, los dos conviven (turno partido). */
  const asignarZona = async () => {
    if (!cfgPerfilId) {
      setErr({ msg: "Selecciona al encargado", ok: false });
      return;
    }
    if (cfgFin <= cfgInicio) {
      setErr({ msg: "La hora de término debe ser posterior a la de inicio", ok: false });
      return;
    }
    const combo = TURNOS_ZONA[cfgRol];
    const motivo = motivoFueraDeRegla(
      data.reglasOperador,
      cfgPerfilId,
      cfgDia,
      cfgInicio,
      cfgFin,
      combo.turno,
      combo.zona
    );
    if (motivo) {
      setErr({ msg: `${nombreDe(cfgPerfilId)} ${motivo} (ver Operadores y Reglas).`, ok: false });
      return;
    }
    const fila: TurnoFuncionario = {
      id: idTurnoFuncionario(cfgPerfilId, cfgDia, cfgInicio),
      perfilId: cfgPerfilId,
      diaSemana: cfgDia,
      turno: combo.turno,
      zona: combo.zona,
      horaInicio: cfgInicio,
      horaFin: cfgFin,
      activo: true,
    };
    const sinElAnterior = data.turnosFuncionario.map((t) =>
      t.id !== fila.id && t.diaSemana === cfgDia && t.turno === combo.turno && t.zona === combo.zona
        ? { ...t, zona: null }
        : t
    );
    const ok = await commit({ turnosFuncionario: conTramo(sinElAnterior, fila) });
    setErr(
      ok
        ? { msg: `${DIAS_SEMANA[cfgDia]}: ${combo.label} queda a cargo de ${nombreDe(cfgPerfilId)}.`, ok: true }
        : { msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  /** Dejar la zona sin encargado. No borra la fila: esa persona sigue
   * trabajando ese día en ese horario, solo deja de ser la responsable. */
  const quitarZona = async (fila: TurnoFuncionario) => {
    const ok = await commit({
      turnosFuncionario: data.turnosFuncionario.map((t) => (t.id === fila.id ? { ...t, zona: null } : t)),
    });
    if (!ok) setErr({ msg: "No se pudo quitar el encargado (sin conexión).", ok: false });
  };

  const agregarTarea = async () => {
    const descripcion = nuevaTarea.trim();
    if (!descripcion) {
      setErr({ msg: "Escribe la tarea", ok: false });
      return;
    }
    const delChecklist = data.tareasTurno.filter((t) => t.turno === turno && t.zona === zona);
    const orden = Math.max(0, ...delChecklist.map((t) => t.orden)) + 1;
    const nueva: TareaTurno = { id: uid(), turno, zona, descripcion, orden, activo: true };
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

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        El local se abre y se cierra por zona —prelavado y aspirados—, cada una con su checklist obligatorio. Acá se
        define quién responde por cada zona y qué tareas trae; el encargado las marca desde Mi Entorno el día que le
        toca.
      </div>

      {puedeConfigurar ? (
        <>
          <h3>Encargados por día</h3>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Día</TableHead>
                  {TURNOS_ZONA.map((c) => (
                    <TableHead key={c.label}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {DIAS_ORDEN.map((i) => (
                  <TableRow key={i}>
                    <TableCell>{DIAS_SEMANA[i]}</TableCell>
                    {TURNOS_ZONA.map((c) => {
                      const t = encargadoDeZona(data.turnosFuncionario, i, c.turno, c.zona);
                      return (
                        <TableCell key={c.label} style={{ whiteSpace: "nowrap" }}>
                          {t ? (
                            <>
                              <div>{nombreDe(t.perfilId) ?? "-"}</div>
                              <div style={{ fontSize: 12, color: "var(--gray)" }}>
                                {t.horaInicio}-{t.horaFin}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Dejar la zona sin encargado"
                                aria-label="Dejar la zona sin encargado"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => quitarZona(t)}
                              >
                                <Trash2 />
                              </Button>
                            </>
                          ) : (
                            <span style={{ color: "var(--gray)" }}>Sin asignar</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginTop: 16 }}>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Día</label>
              <select value={cfgDia} onChange={(e) => setCfgDia(Number(e.target.value))}>
                {DIAS_ORDEN.map((i) => (
                  <option key={i} value={i}>
                    {DIAS_SEMANA[i]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Turno y zona</label>
              <select value={cfgRol} onChange={(e) => setCfgRol(Number(e.target.value))}>
                {TURNOS_ZONA.map((c, i) => (
                  <option key={c.label} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Encargado</label>
              <select value={cfgPerfilId} onChange={(e) => setCfgPerfilId(e.target.value)}>
                <option value="">Selecciona…</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Desde</label>
              <input type="time" value={cfgInicio} onChange={(e) => setCfgInicio(e.target.value)} />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Hasta</label>
              <input type="time" value={cfgFin} onChange={(e) => setCfgFin(e.target.value)} />
            </div>
          </div>
          <Button onClick={asignarZona}>Asignar encargado</Button>
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 8 }}>
            Cada zona tiene un solo encargado por turno y día: al asignarla se la quita a quien la tenía. Y cada persona
            tiene un solo turno por día, así que asignarle una zona reemplaza el horario que tuviera ese día (ver
            Horarios y Turnos).
          </div>
        </>
      ) : (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
          Repartir las zonas entre el equipo queda reservado a Administración y Gerencia. Acá puedes editar las tareas
          de cada checklist y revisar el cumplimiento.
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Tareas de cada checklist</h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {TURNOS_ZONA.map((c, i) => (
          <Button key={c.label} variant={checklist === i ? "default" : "secondary"} onClick={() => setChecklist(i)}>
            {c.label}
          </Button>
        ))}
      </div>

      <div className="field">
        <label>Nueva tarea de {label.toLowerCase()}</label>
        <input
          value={nuevaTarea}
          onChange={(e) => setNuevaTarea(e.target.value)}
          placeholder="Ej: Cortar matriz general de agua"
        />
      </div>
      <Button onClick={agregarTarea}>Agregar al checklist</Button>

      <div style={{ marginTop: 18 }}>
        {data.tareasTurno
          .filter((t) => t.turno === turno && t.zona === zona)
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

      {err && (
        <div className="err" style={{ color: err.ok ? "var(--green)" : undefined, marginTop: 10 }}>
          {err.msg}
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Cumplimiento</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Checklist</TableHead>
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
                <TableRow key={`${h.fecha}|${h.turno}|${h.zona}`}>
                  <TableCell>{h.fecha}</TableCell>
                  <TableCell>{labelTurnoZona(h.turno, h.zona)}</TableCell>
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
    </div>
  );
}
