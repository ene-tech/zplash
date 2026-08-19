"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { DIAS_SEMANA, ordenarPerfiles, TURNO_LABELS } from "@/lib/helpers";
import type { TurnoFuncionario, TurnoTipo } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

/** Id determinista: un perfil tiene a lo más UN turno por día de la semana
 * (unique index en turnos_funcionario), así que reasignar el martes reescribe
 * la misma fila en vez de crear una segunda. */
function idTurno(perfilId: string, diaSemana: number): string {
  return `tf-${perfilId}-${diaSemana}`;
}

export default function TurnosFuncionarioTab() {
  const { data, ui, commit } = useApp();
  const perfil = ui.perfilActual;
  const puedeEditar = perfil?.modulos.includes("perfiles") || false;

  const funcionarios = ordenarPerfiles(data.perfiles.filter((p) => p.modulos.includes("funcionario")));
  const [perfilId, setPerfilId] = useState(perfil?.id || "");
  const [diaSemana, setDiaSemana] = useState(1);
  const [turno, setTurno] = useState<TurnoTipo>("apertura");
  const [horaInicio, setHoraInicio] = useState("08:30");
  const [horaFin, setHoraFin] = useState("17:00");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const turnoDe = (pid: string, dia: number) =>
    data.turnosFuncionario.find((t) => t.perfilId === pid && t.diaSemana === dia && t.activo);

  const guardar = async () => {
    if (!perfilId) {
      setErr({ msg: "Selecciona al funcionario", ok: false });
      return;
    }
    if (horaFin <= horaInicio) {
      setErr({ msg: "La hora de término debe ser posterior a la de inicio", ok: false });
      return;
    }
    const fila: TurnoFuncionario = {
      id: idTurno(perfilId, diaSemana),
      perfilId,
      diaSemana,
      turno,
      horaInicio,
      horaFin,
      activo: true,
    };
    const resto = data.turnosFuncionario.filter((t) => t.id !== fila.id);
    const ok = await commit({ turnosFuncionario: [...resto, fila] });
    setErr(
      ok
        ? { msg: `${DIAS_SEMANA[diaSemana]} asignado como ${TURNO_LABELS[turno].toLowerCase()}.`, ok: true }
        : { msg: "No se pudo guardar el turno (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  const quitar = async (fila: TurnoFuncionario) => {
    const ok = await commit({ turnosFuncionario: data.turnosFuncionario.filter((t) => t.id !== fila.id) });
    if (!ok) setErr({ msg: "No se pudo quitar el turno", ok: false });
  };

  if (!perfil) return <div className="empty">Sesión no válida</div>;

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        El turno asignado define qué checklist te toca: quien tiene <strong>Apertura</strong> hace las tareas de abrir
        el local y quien tiene <strong>Cierre</strong> las de cerrarlo (ver la pestaña Apertura y Cierre). Un día sin
        turno asignado es día libre.
      </div>

      <h3>Mi semana</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Día</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Función</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIAS_SEMANA.map((dia, i) => {
              const t = turnoDe(perfil.id, i);
              return (
                <TableRow key={dia}>
                  <TableCell>{dia}</TableCell>
                  <TableCell>{t ? `${t.horaInicio} a ${t.horaFin}` : "-"}</TableCell>
                  <TableCell>
                    {t ? (
                      <span className={`plate-tag ${t.turno === "apertura" ? "ok" : t.turno === "cierre" ? "warn" : "info"}`}>
                        {TURNO_LABELS[t.turno]}
                      </span>
                    ) : (
                      "Libre"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <h3 style={{ marginTop: 28 }}>Turnos del equipo</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionario</TableHead>
              {DIAS_SEMANA.map((d) => (
                <TableHead key={d}>{d.slice(0, 3)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {funcionarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="empty">Ningún perfil tiene el módulo Mi Entorno asignado todavía</div>
                </TableCell>
              </TableRow>
            ) : (
              funcionarios.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.nombre}</TableCell>
                  {DIAS_SEMANA.map((dia, i) => {
                    const t = turnoDe(f.id, i);
                    return (
                      <TableCell key={dia} style={{ whiteSpace: "nowrap" }}>
                        {t ? (
                          <>
                            <span
                              className={`plate-tag ${t.turno === "apertura" ? "ok" : t.turno === "cierre" ? "warn" : "info"}`}
                            >
                              {t.turno === "apertura" ? "Apertura" : t.turno === "cierre" ? "Cierre" : "Normal"}
                            </span>
                            <div style={{ fontSize: 12, color: "var(--gray)" }}>
                              {t.horaInicio}-{t.horaFin}
                            </div>
                            {puedeEditar && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Quitar turno"
                                aria-label="Quitar turno"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => quitar(t)}
                              >
                                <Trash2 />
                              </Button>
                            )}
                          </>
                        ) : (
                          <span style={{ color: "var(--gray)" }}>-</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {puedeEditar && (
        <>
          <h3 style={{ marginTop: 28 }}>Asignar turno</h3>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Funcionario</label>
              <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)}>
                <option value="">Selecciona…</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Día</label>
              <select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label>Función</label>
              <select value={turno} onChange={(e) => setTurno(e.target.value as TurnoTipo)}>
                <option value="apertura">Apertura</option>
                <option value="cierre">Cierre</option>
                <option value="normal">Turno normal</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Desde</label>
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Hasta</label>
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </div>
          </div>
          {err && (
            <div className="err" style={{ color: err.ok ? "var(--green)" : undefined }}>
              {err.msg}
            </div>
          )}
          <Button onClick={guardar}>Guardar turno</Button>
        </>
      )}
    </div>
  );
}
