"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  avisosDotacion,
  avisosLegales,
  conTramo,
  DIAS_ORDEN,
  DIAS_SEMANA,
  idTurnoFuncionario,
  motivoFueraDeRegla,
  perfilesDelEquipo,
  proponerHorario,
  tramosDelDiaSemana,
  TURNO_LABELS,
  uid,
  ZONA_LABELS,
} from "@/lib/helpers";
import type { HorarioLocal } from "@/lib/helpers";
import type { PerfilPublico, TramoDotacion, TurnoFuncionario, TurnoTipo } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Wand2 } from "lucide-react";

/** La semana completa del equipo en una grilla: una fila por funcionario, una
 * columna por día. La usan tanto el horario vigente (con botón de quitar) como
 * la propuesta que todavía no se aplica (sin él). */
function GrillaSemana({
  funcionarios,
  turnos,
  onQuitar,
}: {
  funcionarios: PerfilPublico[];
  turnos: TurnoFuncionario[];
  onQuitar?: (fila: TurnoFuncionario) => void;
}) {
  const tramosDe = (pid: string, dia: number) => tramosDelDiaSemana(turnos, pid, dia);

  return (
    <div className="table-scroll">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Funcionario</TableHead>
            {DIAS_ORDEN.map((dia) => (
              <TableHead key={dia}>{DIAS_SEMANA[dia].slice(0, 3)}</TableHead>
            ))}
            <TableHead>Días</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funcionarios.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9}>
                <div className="empty">Ningún perfil tiene el módulo Operador ni Mi Entorno asignado todavía</div>
              </TableCell>
            </TableRow>
          ) : (
            funcionarios.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.nombre}</TableCell>
                {DIAS_ORDEN.map((dia) => {
                  const tramos = tramosDe(f.id, dia);
                  return (
                    <TableCell key={dia} style={{ whiteSpace: "nowrap" }}>
                      {tramos.length === 0 ? (
                        <span style={{ color: "var(--gray)" }}>-</span>
                      ) : (
                        tramos.map((t) => (
                          <div key={t.id} style={{ marginBottom: 4 }}>
                            <span
                              className={`plate-tag ${t.turno === "apertura" ? "ok" : t.turno === "cierre" ? "warn" : "info"}`}
                            >
                              {TURNO_LABELS[t.turno]}
                              {t.zona ? ` · ${ZONA_LABELS[t.zona]}` : ""}
                            </span>
                            <div style={{ fontSize: 12, color: "var(--gray)" }}>
                              {t.horaInicio}-{t.horaFin}
                            </div>
                            {onQuitar && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={`Quitar tramo ${t.horaInicio}-${t.horaFin}`}
                                aria-label={`Quitar tramo ${t.horaInicio}-${t.horaFin}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => onQuitar(t)}
                              >
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </TableCell>
                  );
                })}
                {/* Días trabajados, no tramos: un turno partido es un día, no dos. */}
                <TableCell>
                  {new Set(turnos.filter((t) => t.perfilId === f.id && t.activo).map((t) => t.diaSemana)).size}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** Los avisos de la semana: puestos sin encargado y reglas legales pasadas a
 * llevar (ver avisosLegales). Son avisos, no bloqueos: la excepción se puede
 * hacer, pero se ve. */
function Avisos({ lista }: { lista: string[] }) {
  if (!lista.length) return null;
  return (
    <div className="err" style={{ marginBottom: 10, textAlign: "left" }}>
      {lista.map((a) => (
        <div key={a}>{a}</div>
      ))}
    </div>
  );
}

/** Horario semanal del equipo. Lo llena quien administra a las personas —a
 * mano o pidiéndole una propuesta al creador de horario, ver proponerHorario—
 * y cada funcionario ve solo SU semana, de solo lectura, en Mi Entorno. El
 * servidor gatea estas escrituras con el módulo "perfiles" (ver
 * upsertTurnosFuncionario), el mismo con el que se abre esta vista. */
export default function HorariosEquipoTab() {
  const { data, commit } = useApp();
  const funcionarios = perfilesDelEquipo(data.perfiles);
  const [perfilId, setPerfilId] = useState("");
  const [diaSemana, setDiaSemana] = useState(1);
  const [turno, setTurno] = useState<TurnoTipo>("apertura");
  const [horaInicio, setHoraInicio] = useState("08:30");
  const [horaFin, setHoraFin] = useState("17:00");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  // Criterios del creador de horario. Se guarda a quién se EXCLUYE y no a quién
  // se incluye, para que la rotación arranque con todo el equipo aunque los
  // perfiles terminen de cargar después de montar la pantalla.
  // Un horario por grupo de días: el local no abre igual entre semana que el
  // fin de semana, así que la lista arranca con esos dos y se le agregan más.
  const [horarios, setHorarios] = useState<HorarioLocal[]>([
    { dias: [1, 2, 3, 4, 5], apertura: "08:15", cierre: "20:00" },
    { dias: [0, 6], apertura: "09:40", cierre: "19:00" },
  ]);
  const [diasLibres, setDiasLibres] = useState(1);
  // La dotación sí se persiste (config.dotacion): es el requerimiento del
  // local, no un criterio de una corrida del creador de horario.
  const [dotacion, setDotacion] = useState<TramoDotacion[]>(data.config.dotacion);
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [propuesta, setPropuesta] = useState<{ turnos: TurnoFuncionario[]; avisos: string[] } | null>(null);

  const enRotacion = funcionarios.filter((f) => !excluidos.includes(f.id));
  const avisosPropuesta = propuesta ? [...propuesta.avisos, ...avisosLegales(propuesta.turnos, enRotacion)] : [];
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const editarHorario = (i: number, cambio: Partial<HorarioLocal>) =>
    setHorarios(horarios.map((h, j) => (j === i ? { ...h, ...cambio } : h)));
  const editarDotacion = (id: string, cambio: Partial<TramoDotacion>) =>
    setDotacion(dotacion.map((t) => (t.id === id ? { ...t, ...cambio } : t)));

  const guardarDotacion = async () => {
    if (dotacion.some((t) => t.hasta <= t.desde)) {
      setErr({ msg: "En cada franja la hora de término tiene que ser posterior a la de inicio", ok: false });
      return;
    }
    const ok = await commit({ config: { ...data.config, dotacion } });
    setErr(
      ok
        ? { msg: "Dotación guardada: el creador de horario ya la va a respetar.", ok: true }
        : { msg: "No se pudo guardar la dotación (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  const guardar = async () => {
    if (!perfilId) {
      setErr({ msg: "Selecciona al funcionario", ok: false });
      return;
    }
    if (horaFin <= horaInicio) {
      setErr({ msg: "La hora de término debe ser posterior a la de inicio", ok: false });
      return;
    }
    const id = idTurnoFuncionario(perfilId, diaSemana, horaInicio);
    // La zona la reparte el configurador de Apertura y Cierre: cambiar acá el
    // horario o la función del día no debe soltarle la zona a nadie.
    const zona = data.turnosFuncionario.find((t) => t.id === id)?.zona ?? null;
    // El tope horario de esa persona y sus vetos de apertura/cierre mandan
    // sobre lo que se le quiera asignar (ver Operadores y Reglas).
    const motivo = motivoFueraDeRegla(data.reglasOperador, perfilId, diaSemana, horaInicio, horaFin, turno, zona);
    if (motivo) {
      const nombre = funcionarios.find((f) => f.id === perfilId)?.nombre ?? "El funcionario";
      setErr({ msg: `${nombre} ${motivo} (ver Operadores y Reglas).`, ok: false });
      return;
    }
    const fila: TurnoFuncionario = {
      id,
      perfilId,
      diaSemana,
      turno,
      zona,
      horaInicio,
      horaFin,
      activo: true,
    };
    // conTramo deja convivir el tramo de la mañana con el de la tarde y solo
    // reescribe el que se pise con el nuevo (ver conTramo).
    const ok = await commit({ turnosFuncionario: conTramo(data.turnosFuncionario, fila) });
    setErr(
      ok
        ? {
            msg: `${DIAS_SEMANA[diaSemana]} ${horaInicio}-${horaFin} asignado como ${TURNO_LABELS[turno].toLowerCase()}.`,
            ok: true,
          }
        : { msg: "No se pudo guardar el turno (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  const quitar = async (fila: TurnoFuncionario) => {
    const ok = await commit({ turnosFuncionario: data.turnosFuncionario.filter((t) => t.id !== fila.id) });
    if (!ok) setErr({ msg: "No se pudo quitar el tramo", ok: false });
  };

  const crearHorario = () => {
    setErr(null);
    if (!enRotacion.length) {
      setErr({ msg: "Deja al menos a una persona en la rotación", ok: false });
      return;
    }
    if (!horarios.some((h) => h.dias.length)) {
      setErr({ msg: "Marca al menos un día de apertura del local", ok: false });
      return;
    }
    if (horarios.some((h) => h.dias.length && h.cierre <= h.apertura)) {
      setErr({ msg: "En cada horario el local tiene que cerrar después de abrir", ok: false });
      return;
    }
    setPropuesta(
      proponerHorario({
        perfilIds: enRotacion.map((f) => f.id),
        horarios,
        diasLibres,
        reglas: data.reglasOperador,
        dotacion,
      })
    );
  };

  /** Aplicar reescribe la semana de quienes entraron a la rotación y deja
   * intacta la de los demás: a quien excluiste no se le toca el horario. */
  const aplicar = async () => {
    if (!propuesta) return;
    const ids = enRotacion.map((f) => f.id);
    const otros = data.turnosFuncionario.filter((t) => !ids.includes(t.perfilId));
    const ok = await commit({ turnosFuncionario: [...otros, ...propuesta.turnos] });
    setErr(
      ok
        ? { msg: "Horario aplicado: el equipo ya ve su nueva semana en Mi Entorno.", ok: true }
        : { msg: "No se pudo aplicar el horario (sin conexión). Intenta de nuevo.", ok: false }
    );
    if (ok) setPropuesta(null);
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Acá se arma la semana del equipo. El turno asignado define qué checklist le toca a cada uno:{" "}
        <strong>Apertura</strong> abre el local y <strong>Cierre</strong> lo cierra (ver Apertura y Cierre). Un día sin
        turno asignado es día libre. Un mismo día admite dos tramos —mañana y tarde, con la colación entre medio—:
        guarda uno, cambia las horas y guarda el otro. Un tramo que se pisa con otro del mismo día lo reescribe.
      </div>

      <h3>Turnos del equipo</h3>
      <GrillaSemana funcionarios={funcionarios} turnos={data.turnosFuncionario} onQuitar={quitar} />
      <Avisos lista={[...avisosLegales(data.turnosFuncionario, funcionarios), ...avisosDotacion(data.turnosFuncionario, dotacion)]} />

      <h3 style={{ marginTop: 28 }}>Dotación</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Cuánta gente necesita el local en cada franja: &quot;los sábados de 12:00 a 16:00, 4 operadores&quot;. El
        creador de horario suma turnos hasta llegar a ese número, y arriba se avisa cuando la semana asignada deja una
        franja corta. Dos franjas que se pisan no se suman: cada una pide <em>al menos</em> esa cantidad.
      </div>
      {dotacion.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {DIAS_ORDEN.map((dia) => (
              <label key={dia} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={t.dias.includes(dia)}
                  onChange={() => editarDotacion(t.id, { dias: alternar(t.dias, dia) })}
                  style={{ width: "auto" }}
                />
                {DIAS_SEMANA[dia].slice(0, 3)}
              </label>
            ))}
          </div>
          <input
            type="time"
            aria-label="La franja empieza"
            value={t.desde}
            onChange={(e) => editarDotacion(t.id, { desde: e.target.value })}
            style={{ width: 120 }}
          />
          <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
          <input
            type="time"
            aria-label="La franja termina"
            value={t.hasta}
            onChange={(e) => editarDotacion(t.id, { hasta: e.target.value })}
            style={{ width: 120 }}
          />
          <input
            type="number"
            aria-label="Operadores necesarios"
            min={1}
            max={20}
            value={t.cantidad}
            onChange={(e) => editarDotacion(t.id, { cantidad: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--gray)", fontSize: 13 }}>operadores</span>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Quitar esta franja"
            aria-label="Quitar esta franja"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDotacion(dotacion.filter((x) => x.id !== t.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {dotacion.length === 0 && (
        <div className="empty" style={{ marginBottom: 8 }}>
          Sin dotación definida: el horario se arma solo con los cuatro encargados de apertura y cierre.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setDotacion([...dotacion, { id: uid(), dias: [1, 2, 3, 4, 5], desde: "12:00", hasta: "16:00", cantidad: 2 }])
          }
        >
          <Plus /> Agregar franja
        </Button>
        <Button onClick={guardarDotacion}>Guardar dotación</Button>
      </div>

      <h3 style={{ marginTop: 28 }}>Crear horario</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Define los criterios y se propone una semana completa: cada día que abre el local queda con sus cuatro
        encargados (apertura y cierre de prelavado y de aspirados), repartidos parejo y rotando quién entra de mañana y
        quién de tarde. El local tiene horario continuado, así que cada grupo de días lleva solo sus dos horas —abre y
        cierra— y el relevo entre la mañana y la tarde cae en la mitad de esa jornada. Agrega un horario por cada grupo
        de días que abra distinto. Es solo una propuesta hasta que la apliques, y después la puedes retocar a mano
        turno por turno.
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flexBasis: "100%" }}>
          <label>Días que abre el local</label>
          {horarios.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {DIAS_ORDEN.map((dia) => (
                  <label key={dia} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={h.dias.includes(dia)}
                      onChange={() => editarHorario(i, { dias: alternar(h.dias, dia) })}
                      style={{ width: "auto" }}
                    />
                    {DIAS_SEMANA[dia].slice(0, 3)}
                  </label>
                ))}
              </div>
              <input
                type="time"
                aria-label="El local abre"
                value={h.apertura}
                onChange={(e) => editarHorario(i, { apertura: e.target.value })}
                style={{ width: 120 }}
              />
              <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
              <input
                type="time"
                aria-label="El local cierra"
                value={h.cierre}
                onChange={(e) => editarHorario(i, { cierre: e.target.value })}
                style={{ width: 120 }}
              />
              {horarios.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Quitar este horario"
                  aria-label="Quitar este horario"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setHorarios(horarios.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHorarios([...horarios, { dias: [], apertura: "09:40", cierre: "19:00" }])}
          >
            <Plus /> Agregar horario
          </Button>
        </div>
        <div className="field" style={{ minWidth: 130 }}>
          <label>Días libres por persona</label>
          <input
            type="number"
            min={0}
            max={6}
            value={diasLibres}
            onChange={(e) => setDiasLibres(Math.min(6, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
        <div className="field">
          <label>Entran a la rotación</label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {funcionarios.map((f) => (
              <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!excluidos.includes(f.id)}
                  onChange={() => setExcluidos(alternar(excluidos, f.id))}
                  style={{ width: "auto" }}
                />
                {f.nombre}
              </label>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={crearHorario}>
        <Wand2 /> Crear horario
      </Button>

      {propuesta && (
        <div style={{ marginTop: 20 }}>
          <h3>Propuesta</h3>
          <Avisos lista={avisosPropuesta} />
          <GrillaSemana funcionarios={enRotacion} turnos={propuesta.turnos} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Button onClick={aplicar}>Aplicar propuesta</Button>
            <Button variant="ghost" onClick={() => setPropuesta(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Asignar turno</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Para un turno partido guarda dos veces el mismo día, una por tramo: 08:30-13:00 y 14:00-19:00 dejan la
        colación entre las 13:00 y las 14:00.
      </div>
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
            {DIAS_ORDEN.map((dia) => (
              <option key={dia} value={dia}>
                {DIAS_SEMANA[dia]}
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
      <Button onClick={guardar}>Guardar tramo</Button>
    </div>
  );
}
