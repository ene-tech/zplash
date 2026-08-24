"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { avanceChecklist, checklistDelDia, idTareaHecha, tareasDelChecklist, todayYMD, TURNOS_ZONA } from "@/lib/helpers";
import type { TareaTurno, TareaTurnoHecha } from "@/types";
import { Button } from "@/components/ui/button";

/** El checklist que le toca hoy al funcionario y nada más: el catálogo de
 * tareas, el reparto de zonas y el cumplimiento histórico del equipo viven en
 * Gestión de Equipo (ver EquipoView). */
export default function TareasTurnoTab() {
  const { data, ui, commit } = useApp();
  const perfil = ui.perfilActual;
  const hoy = todayYMD();

  // Cubrir a un compañero ausente: el checklist se marca igual, pero hay que
  // elegirlo a mano y queda registrado a nombre de quien lo marca.
  const [cubriendo, setCubriendo] = useState<number | null>(null);
  const miChecklist = perfil ? checklistDelDia(data.turnosFuncionario, perfil.id, hoy) : null;
  const combo = cubriendo != null ? TURNOS_ZONA[cubriendo] : miChecklist;

  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  if (!perfil) return <div className="empty">Sesión no válida</div>;

  const hechaDe = (tareaId: string) =>
    combo && data.tareasTurnoHechas.find((h) => h.id === idTareaHecha(hoy, combo.turno, combo.zona, tareaId));

  const alternar = async (tarea: TareaTurno) => {
    if (!combo) return;
    const yaHecha = hechaDe(tarea.id);
    if (yaHecha) {
      const ok = await commit({ tareasTurnoHechas: data.tareasTurnoHechas.filter((h) => h.id !== yaHecha.id) });
      if (!ok) setErr({ msg: "No se pudo desmarcar la tarea (sin conexión).", ok: false });
      return;
    }
    const nueva: TareaTurnoHecha = {
      id: idTareaHecha(hoy, combo.turno, combo.zona, tarea.id),
      fecha: hoy,
      turno: combo.turno,
      zona: combo.zona,
      tareaId: tarea.id,
      perfilId: perfil.id,
      perfilNombre: perfil.nombre,
      completadoEn: new Date().toISOString(),
    };
    const ok = await commit({ tareasTurnoHechas: [...data.tareasTurnoHechas, nueva] });
    if (!ok) setErr({ msg: "No se pudo marcar la tarea (sin conexión).", ok: false });
  };

  const selectorCobertura = (
    <details className="disclosure" style={{ marginTop: 20 }}>
      <summary>Estoy cubriendo otra zona</summary>
      <div className="disclosure-body">
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 12 }}>
          Usa esto solo si estás haciendo la apertura o el cierre de una zona que hoy no tienes asignada. Lo que marques
          queda registrado con tu nombre.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {TURNOS_ZONA.map((c, i) => (
            <Button key={c.label} variant={cubriendo === i ? "default" : "secondary"} onClick={() => setCubriendo(i)}>
              {c.label}
            </Button>
          ))}
        </div>
      </div>
    </details>
  );

  if (!combo) {
    return (
      <div>
        <div className="empty">
          Hoy no tienes apertura ni cierre de ninguna zona a tu cargo. Tu turno lo asigna Administración (ver Mi
          Horario).
        </div>
        {selectorCobertura}
      </div>
    );
  }

  const { turno, zona, label } = combo;
  const tareas = tareasDelChecklist(data.tareasTurno, turno, zona);
  const avance = avanceChecklist(data.tareasTurno, data.tareasTurnoHechas, hoy, turno, zona);

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Hoy respondes por <strong>{label.toLowerCase()}</strong>. Marca cada tarea en el momento en que la haces: queda
        registrada con tu nombre y la hora, y solo se puede marcar el día de hoy.
      </div>

      <div style={{ color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        {hoy} · {avance.hechas} de {avance.total} tareas hechas
        {cubriendo != null ? " · estás cubriendo esta zona" : ""}
      </div>

      {tareas.length === 0 ? (
        <div className="empty">Este checklist todavía no tiene tareas configuradas</div>
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

      {selectorCobertura}
    </div>
  );
}
