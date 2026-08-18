"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { diaSemanaDe, lunesDe, minutosDesdeMedianoche } from "@/lib/agenda";
import { sumarDias, todayYMD } from "@/lib/helpers";
import type { Cita } from "@/types";

// Vista semanal de la Agenda: el mismo dato que "Citas del día" del módulo
// Agenda (data.citas), pero como grilla hora × día para ver de un vistazo qué
// cupos quedan libres antes de agendar. Es solo lectura: agendar sigue siendo
// el formulario de arriba, que ya valida disponibilidad contra horario,
// bloqueos y choques (ver validarDisponibilidad en lib/agenda).
const ALTO_HORA = 56; // px por hora; el alto de cada cita sale de su duración
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Color por estado del circuito, mismo criterio semántico que .status-pill:
// pendiente dorado, en proceso azul, listo verde, cerrado gris, salidas rojas.
const COLOR_ESTADO: Record<Cita["estado"], string> = {
  agendado: "var(--gold)",
  recibido: "var(--blue)",
  en_limpieza: "var(--blue)",
  listo_entrega: "var(--green)",
  retirado: "var(--silver)",
  cancelada: "var(--red)",
  no_asistio: "var(--red)",
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function inicioEnMinutos(c: Cita): number {
  const d = new Date(c.fechaHora);
  return d.getHours() * 60 + d.getMinutes();
}

const CABECERA: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "var(--bg-card)",
  borderBottom: "1px solid var(--border)",
  borderLeft: "1px solid var(--border)",
  padding: "8px 6px",
  textAlign: "center",
  fontSize: 13,
};

export function AgendaSemanal() {
  const { data } = useApp();
  const hoy = todayYMD();
  const [lunes, setLunes] = useState(() => lunesDe(hoy));

  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const citasSemana = data.citas.filter((c) => dias.includes(c.fechaHora.slice(0, 10)));

  // Ventana de horas visible: el horario de atención configurado, estirada si
  // alguna cita de la semana cae fuera (p. ej. agendada antes de cambiar el
  // horario) para que ninguna quede invisible.
  let desde = 8 * 60;
  let hasta = 20 * 60;
  if (data.horariosAgenda.length) {
    desde = Math.min(...data.horariosAgenda.map((h) => minutosDesdeMedianoche(h.horaInicio)));
    hasta = Math.max(...data.horariosAgenda.map((h) => minutosDesdeMedianoche(h.horaFin)));
  }
  for (const c of citasSemana) {
    desde = Math.min(desde, inicioEnMinutos(c));
    hasta = Math.max(hasta, inicioEnMinutos(c) + c.duracionMinutos);
  }
  desde = Math.floor(desde / 60) * 60;
  hasta = Math.max(desde + 60, Math.ceil(hasta / 60) * 60);

  const horas = Array.from({ length: (hasta - desde) / 60 }, (_, i) => desde / 60 + i);
  const y = (min: number) => ((min - desde) / 60) * ALTO_HORA;
  const alto = horas.length * ALTO_HORA;

  const nombresServicios = (ids: string[]) =>
    ids
      .map((id) => data.servicios.find((s) => s.id === id)?.nombre)
      .filter(Boolean)
      .join(", ");

  return (
    <div className="scan-panel" style={{ textAlign: "left", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 18, textTransform: "capitalize" }}>
          {new Date(`${lunes}T00:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
        </h3>
        <span style={{ color: "var(--gray)", fontSize: 13 }}>
          {citasSemana.length === 1 ? "1 cita" : `${citasSemana.length} citas`}
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button className="icon-btn" title="Semana anterior" onClick={() => setLunes(sumarDias(lunes, -7))}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn" onClick={() => setLunes(lunesDe(hoy))}>
            Hoy
          </button>
          <button className="icon-btn" title="Semana siguiente" onClick={() => setLunes(sumarDias(lunes, 7))}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ overflow: "auto", maxHeight: 560, border: "1px solid var(--border)", borderRadius: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "54px repeat(7, minmax(102px, 1fr))", minWidth: 760 }}>
          <div style={{ ...CABECERA, borderLeft: "none" }} />
          {dias.map((f) => (
            <div key={f} style={CABECERA}>
              <span style={{ color: "var(--gray)", fontSize: 12 }}>{DIAS[diaSemanaDe(f)]} </span>
              <span
                style={
                  f === hoy
                    ? {
                        display: "inline-block",
                        minWidth: 22,
                        borderRadius: 100,
                        background: "var(--gold)",
                        color: "var(--primary-foreground)",
                        fontWeight: 700,
                      }
                    : { fontWeight: 700 }
                }
              >
                {Number(f.slice(8))}
              </span>
            </div>
          ))}

          <div style={{ position: "relative", height: alto }}>
            {horas.map((h) => (
              <div
                key={h}
                style={{ position: "absolute", top: y(h * 60) - 6, right: 7, fontSize: 11, color: "var(--gray)" }}
              >
                {hhmm(h * 60)}
              </div>
            ))}
          </div>

          {dias.map((f) => {
            const diaSemana = diaSemanaDe(f);
            return (
              <div
                key={f}
                style={{
                  position: "relative",
                  height: alto,
                  borderLeft: "1px solid var(--border)",
                  backgroundColor: f === hoy ? "color-mix(in srgb, var(--gold) 5%, transparent)" : undefined,
                  backgroundImage: `repeating-linear-gradient(var(--border) 0 1px, transparent 1px ${ALTO_HORA}px)`,
                }}
              >
                {/* Franja de atención: lo que queda fuera no es agendable */}
                {data.horariosAgenda
                  .filter((h) => h.diaSemana === diaSemana)
                  .map((h) => (
                    <div
                      key={h.id}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: y(minutosDesdeMedianoche(h.horaInicio)),
                        height: y(minutosDesdeMedianoche(h.horaFin)) - y(minutosDesdeMedianoche(h.horaInicio)),
                        backgroundColor: "color-mix(in srgb, var(--white) 5%, transparent)",
                      }}
                    />
                  ))}

                {data.bloqueosAgenda
                  .filter((b) => b.fecha === f)
                  .map((b) => {
                    const ini = b.todoElDia || !b.horaInicio ? desde : minutosDesdeMedianoche(b.horaInicio);
                    const fin = b.todoElDia || !b.horaFin ? hasta : minutosDesdeMedianoche(b.horaFin);
                    return (
                      <div
                        key={b.id}
                        title={b.motivo ? `Bloqueado: ${b.motivo}` : "Bloqueado"}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: y(ini),
                          height: y(fin) - y(ini),
                          backgroundImage:
                            "repeating-linear-gradient(45deg, color-mix(in srgb, var(--red) 20%, transparent) 0 6px, transparent 6px 12px)",
                        }}
                      />
                    );
                  })}

                {/* ponytail: dos citas superpuestas se dibujan una encima de otra;
                    la capacidad de 1 cupo ya lo evita (validarDisponibilidad). Si
                    algún día hay 2 boxes, repartir el ancho de la columna. */}
                {citasSemana
                  .filter((c) => c.fechaHora.slice(0, 10) === f)
                  .map((c) => {
                    const ini = inicioEnMinutos(c);
                    const color = COLOR_ESTADO[c.estado];
                    const anulada = c.estado === "cancelada" || c.estado === "no_asistio";
                    const servicios = nombresServicios(c.servicioIds);
                    return (
                      <div
                        key={c.id}
                        title={`${hhmm(ini)}–${hhmm(ini + c.duracionMinutos)} · ${c.patente} · ${c.nombre}${
                          servicios ? ` · ${servicios}` : ""
                        }`}
                        style={{
                          position: "absolute",
                          left: 3,
                          right: 3,
                          top: y(ini),
                          height: Math.max(24, (c.duracionMinutos / 60) * ALTO_HORA - 2),
                          padding: "3px 6px",
                          borderRadius: 6,
                          borderLeft: `3px solid ${color}`,
                          backgroundColor: `color-mix(in srgb, ${color} 16%, var(--bg-panel))`,
                          overflow: "hidden",
                          fontSize: 11,
                          lineHeight: 1.3,
                          opacity: anulada ? 0.55 : 1,
                          textDecoration: anulada ? "line-through" : undefined,
                        }}
                      >
                        <div style={{ color, fontWeight: 700 }}>{hhmm(ini)}</div>
                        <div style={{ fontWeight: 700 }}>{c.patente}</div>
                        <div style={{ color: "var(--gray)" }}>{servicios || c.nombre}</div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
