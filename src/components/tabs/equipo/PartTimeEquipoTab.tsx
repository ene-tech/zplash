"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import {
  avisosPartTime,
  DIAS_ORDEN,
  DIAS_SEMANA,
  horasPartTime,
  planillaVigente,
  sugerirPartTime,
  TOPE_HORAS_PART_TIME,
  uid,
} from "@/lib/helpers";
import type { DisponibilidadPartTime, PartTime, TramoPartTime } from "@/types";
import { Avisos } from "./HorariosEquipoTab";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

/** Los días de una fila, como checkboxes en el orden de la semana. Lo usan las
 * tres tablas de esta pantalla (disponibilidad, planilla y huecos). */
function Dias({ dias, onToggle }: { dias: number[]; onToggle: (dia: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {DIAS_ORDEN.map((dia) => (
        <label key={dia} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={dias.includes(dia)} onChange={() => onToggle(dia)} style={{ width: "auto" }} />
          {DIAS_SEMANA[dia].slice(0, 3)}
        </label>
      ))}
    </div>
  );
}

/** Part time: las fichas de quienes vienen a reforzar la dotación sin ser
 * parte del equipo de planta —no entran a la app ni toman apertura o cierre,
 * solo suman cuerpos en el peak y el fin de semana— y la planilla de lo que
 * cada uno viene a cubrir cada semana.
 *
 * La planilla es una variable más del creador de horario (ver
 * proponerHorario): lo que cubre el part time no se le pide al equipo de
 * planta, así que cargarla acá cambia la propuesta que sale en Horarios y
 * Turnos. Abajo va el sugerido: cuántos part time faltan para cerrar la
 * dotación con el horario que hoy tiene el equipo y qué horario tendría que
 * cumplir cada uno (ver sugerirPartTime). */
export default function PartTimeEquipoTab() {
  const { data, commit } = useAppData();
  const [partTimes, setPartTimes] = useState<PartTime[]>(data.config.partTimes);
  const [planilla, setPlanilla] = useState<TramoPartTime[]>(data.config.planillaPartTime);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const alternar = (lista: number[], v: number) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const editarPartTime = (id: string, cambio: Partial<PartTime>) =>
    setPartTimes(partTimes.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
  const editarHorario = (pt: PartTime, horarioId: string, cambio: Partial<DisponibilidadPartTime>) =>
    editarPartTime(pt.id, { horarios: pt.horarios.map((h) => (h.id === horarioId ? { ...h, ...cambio } : h)) });
  const editarTramo = (id: string, cambio: Partial<TramoPartTime>) =>
    setPlanilla(planilla.map((t) => (t.id === id ? { ...t, ...cambio } : t)));

  /** Quitar una ficha se lleva sus tramos de la planilla: un tramo huérfano
   * seguiría contando como dotación en pie de alguien que ya no viene. */
  const quitarPartTime = (id: string) => {
    setPartTimes(partTimes.filter((p) => p.id !== id));
    setPlanilla(planilla.filter((t) => t.partTimeId !== id));
  };

  // El sugerido se calcula con lo que hay en pantalla (todavía sin guardar):
  // así se ve al tiro cuánto cierra cada tramo que se agrega a la planilla.
  const sugerencia = sugerirPartTime(
    data.turnosFuncionario,
    data.config.dotacion,
    planillaVigente(planilla, partTimes),
    partTimes
  );

  const guardar = async () => {
    if (partTimes.some((p) => !p.nombre.trim())) {
      setErr({ msg: "Ponle nombre a cada part time", ok: false });
      return;
    }
    if ([...partTimes.flatMap((p) => p.horarios), ...planilla].some((h) => h.hasta <= h.desde)) {
      setErr({ msg: "En cada horario la hora de término tiene que ser posterior a la de inicio", ok: false });
      return;
    }
    if (planilla.some((t) => !t.partTimeId || !t.dias.length)) {
      setErr({ msg: "Cada tramo de la planilla necesita una persona y al menos un día", ok: false });
      return;
    }
    const ok = await commit({ config: { ...data.config, partTimes, planillaPartTime: planilla } });
    setErr(
      ok
        ? { msg: "Part time guardado: el creador de horario ya cuenta con la planilla.", ok: true }
        : { msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Acá van las personas que refuerzan la dotación sin ser del equipo de planta. Cada ficha lleva{" "}
        <strong>cuándo podría prestar servicio</strong>, y la <strong>planilla</strong> de más abajo dice qué tramo
        viene a cubrir cada semana. Lo que cubre el part time no se le pide al equipo: el creador de horario lo
        descuenta antes de mandar a alguien de planta al peak, y los avisos de dotación de Horarios y Turnos lo cuentan
        como gente en el local. El tope legal part time es de {TOPE_HORAS_PART_TIME} h a la semana por persona.
      </div>

      <h3>Fichas</h3>
      {partTimes.length === 0 && <div className="empty">Todavía no hay part times cargados</div>}
      {partTimes.map((pt) => (
        <div
          key={pt.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
            opacity: pt.activo ? 1 : 0.6,
          }}
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Nombre</label>
              <input value={pt.nombre} onChange={(e) => editarPartTime(pt.id, { nombre: e.target.value })} />
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label>Teléfono</label>
              <input
                value={pt.telefono ?? ""}
                onChange={(e) => editarPartTime(pt.id, { telefono: e.target.value })}
                placeholder="+569…"
              />
            </div>
            <div className="field" style={{ minWidth: 200, flex: 1 }}>
              <label>Notas</label>
              <input
                value={pt.notas ?? ""}
                onChange={(e) => editarPartTime(pt.id, { notas: e.target.value })}
                placeholder="Ej: estudiante, solo fines de semana"
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, paddingBottom: 10 }}>
              <input
                type="checkbox"
                checked={pt.activo}
                onChange={() => editarPartTime(pt.id, { activo: !pt.activo })}
                style={{ width: "auto" }}
              />
              Activo
            </label>
            <span className="plate-tag info" style={{ marginBottom: 8 }}>
              {horasPartTime(planilla, pt.id)} h/sem
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Quitar este part time"
              aria-label={`Quitar a ${pt.nombre || "este part time"}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              style={{ marginBottom: 8 }}
              onClick={() => quitarPartTime(pt.id)}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>Horarios en que podría prestar servicio</label>
            {pt.horarios.length === 0 && (
              <div style={{ color: "var(--gray)", fontSize: 13, marginBottom: 6 }}>
                Sin disponibilidad declarada: no se le va a sugerir para ningún hueco.
              </div>
            )}
            {pt.horarios.map((h) => (
              <div
                key={h.id}
                style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}
              >
                <Dias dias={h.dias} onToggle={(dia) => editarHorario(pt, h.id, { dias: alternar(h.dias, dia) })} />
                <input
                  type="time"
                  aria-label="Puede desde"
                  value={h.desde}
                  onChange={(e) => editarHorario(pt, h.id, { desde: e.target.value })}
                  style={{ width: 120 }}
                />
                <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
                <input
                  type="time"
                  aria-label="Puede hasta"
                  value={h.hasta}
                  onChange={(e) => editarHorario(pt, h.id, { hasta: e.target.value })}
                  style={{ width: 120 }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Quitar este horario"
                  aria-label="Quitar este horario"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => editarPartTime(pt.id, { horarios: pt.horarios.filter((x) => x.id !== h.id) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                editarPartTime(pt.id, {
                  horarios: [...pt.horarios, { id: uid(), dias: [6, 0], desde: "10:00", hasta: "19:00" }],
                })
              }
            >
              <Plus /> Agregar horario
            </Button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setPartTimes([
              ...partTimes,
              { id: uid(), nombre: "", horarios: [{ id: uid(), dias: [6, 0], desde: "10:00", hasta: "19:00" }], activo: true },
            ])
          }
        >
          <Plus /> Agregar part time
        </Button>
        <Button onClick={guardar}>Guardar part times</Button>
      </div>

      <h3 style={{ marginTop: 28 }}>Planilla</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Qué viene a cubrir cada uno: persona, días y horario. Se repite todas las semanas, igual que el horario del
        equipo. Un tramo fuera de la disponibilidad que declaró la persona no se bloquea, se avisa.
      </div>
      {planilla.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <select
            aria-label="Part time"
            value={t.partTimeId}
            onChange={(e) => editarTramo(t.id, { partTimeId: e.target.value })}
            style={{ width: 180 }}
          >
            <option value="">Selecciona…</option>
            {partTimes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.nombre || "(sin nombre)"}
              </option>
            ))}
          </select>
          <Dias dias={t.dias} onToggle={(dia) => editarTramo(t.id, { dias: alternar(t.dias, dia) })} />
          <input
            type="time"
            aria-label="El tramo empieza"
            value={t.desde}
            onChange={(e) => editarTramo(t.id, { desde: e.target.value })}
            style={{ width: 120 }}
          />
          <span style={{ color: "var(--gray)", fontSize: 13 }}>a</span>
          <input
            type="time"
            aria-label="El tramo termina"
            value={t.hasta}
            onChange={(e) => editarTramo(t.id, { hasta: e.target.value })}
            style={{ width: 120 }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            title="Quitar este tramo"
            aria-label="Quitar este tramo"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setPlanilla(planilla.filter((x) => x.id !== t.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {planilla.length === 0 && (
        <div className="empty" style={{ marginBottom: 8 }}>
          Planilla vacía: la dotación se cubre solo con el equipo de planta.
        </div>
      )}
      <Avisos lista={avisosPartTime(planilla, partTimes)} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setPlanilla([
              ...planilla,
              { id: uid(), partTimeId: partTimes[0]?.id ?? "", dias: [6], desde: "12:00", hasta: "16:00" },
            ])
          }
        >
          <Plus /> Agregar tramo
        </Button>
        <Button onClick={guardar}>Guardar planilla</Button>
      </div>
      {err && (
        <div className="err" style={{ color: err.ok ? "var(--green)" : undefined }}>
          {err.msg}
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Sugerido</h3>
      {data.config.dotacion.length === 0 ? (
        <div className="empty">Sin dotación definida no hay nada que sugerir: cárgala en Horarios y Turnos.</div>
      ) : sugerencia.huecos.length === 0 ? (
        <div style={{ color: "var(--green)", fontSize: 13 }}>
          La dotación queda cubierta con el horario del equipo y la planilla actual.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            Faltan <strong>{sugerencia.personas}</strong> part time —{sugerencia.horas} h a la semana— para cumplir la
            dotación.{" "}
            {sugerencia.enLaFicha > 0
              ? `${sugerencia.enLaFicha} de los que ya están en la ficha pueden tomar alguno de estos puestos: agrégalos a la planilla.`
              : "Ninguno de los que están en la ficha tiene disponibilidad para estos puestos."}
          </div>
          {/* Un puesto por persona que hay que sumar, con la semana que
              tendría que cumplir: es lo que se publica para buscarla y lo que
              se copia a la planilla cuando alguien la toma. */}
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Horario que debe cumplir</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Quién puede tomarlo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sugerencia.puestos.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>Part time {i + 1}</TableCell>
                    <TableCell>
                      {p.tramos.map((t) => (
                        <div key={`${t.diaSemana}-${t.desde}`} style={{ whiteSpace: "nowrap" }}>
                          {DIAS_SEMANA[t.diaSemana]} {t.desde}-{t.hasta}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{p.horas} h/sem</TableCell>
                    <TableCell>
                      {p.candidatos.length === 0 ? (
                        <span style={{ color: "var(--gray)" }}>Nadie disponible en la ficha</span>
                      ) : (
                        p.candidatos.map((pt) => (
                          <span key={pt.id} className="plate-tag ok" style={{ marginRight: 4 }}>
                            {pt.nombre}
                          </span>
                        ))
                      )}
                    </TableCell>
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
