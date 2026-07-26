"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { uid } from "@/lib/helpers";
import type { HorarioAgenda } from "@/types";

const DIAS = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
  { valor: 0, nombre: "Domingo" },
];

type Rango = { id?: string; inicio: string; fin: string };

function agruparPorDia(horarios: HorarioAgenda[]): Map<number, Rango[]> {
  const mapa = new Map<number, Rango[]>();
  for (const h of horarios) {
    const lista = mapa.get(h.diaSemana) ?? [];
    lista.push({ id: h.id, inicio: h.horaInicio, fin: h.horaFin });
    mapa.set(h.diaSemana, lista);
  }
  return mapa;
}

export function HorarioSemanal() {
  const { data, commit } = useApp();
  const [rangosPorDia, setRangosPorDia] = useState<Map<number, Rango[]>>(() => agruparPorDia(data.horariosAgenda));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  const agregarRango = (dia: number) => {
    setRangosPorDia((prev) => {
      const copia = new Map(prev);
      copia.set(dia, [...(copia.get(dia) ?? []), { inicio: "09:00", fin: "18:00" }]);
      return copia;
    });
  };

  const quitarRango = (dia: number, index: number) => {
    setRangosPorDia((prev) => {
      const copia = new Map(prev);
      const lista = [...(copia.get(dia) ?? [])];
      lista.splice(index, 1);
      copia.set(dia, lista);
      return copia;
    });
  };

  const actualizarRango = (dia: number, index: number, campo: "inicio" | "fin", valor: string) => {
    setRangosPorDia((prev) => {
      const copia = new Map(prev);
      const lista = [...(copia.get(dia) ?? [])];
      lista[index] = { ...lista[index], [campo]: valor };
      copia.set(dia, lista);
      return copia;
    });
  };

  const guardar = async () => {
    setGuardando(true);
    const nuevosHorarios: HorarioAgenda[] = [];
    for (const dia of DIAS) {
      for (const rango of rangosPorDia.get(dia.valor) ?? []) {
        if (!rango.inicio || !rango.fin || rango.inicio >= rango.fin) continue;
        nuevosHorarios.push({ id: rango.id || uid(), diaSemana: dia.valor, horaInicio: rango.inicio, horaFin: rango.fin });
      }
    }
    const ok = await commit({ horariosAgenda: nuevosHorarios });
    setGuardando(false);
    setMsg(ok ? "Horario guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.");
  };

  return (
    <div className="modal" style={{ maxWidth: 620, margin: "0 0 20px 0" }}>
      <h3>Horario de atención</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Marca los días y rangos de horas en que se puede agendar. Solo se aceptarán horas dentro de este horario al
        registrar un servicio adicional.
      </div>

      {DIAS.map((dia) => {
        const rangos = rangosPorDia.get(dia.valor) ?? [];
        return (
          <div key={dia.valor} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: rangos.length ? 8 : 0 }}>
              <strong style={{ width: 100 }}>{dia.nombre}</strong>
              <button className="btn ghost" style={{ marginTop: 0, padding: "3px 10px", fontSize: "0.82rem" }} onClick={() => agregarRango(dia.valor)}>
                + Agregar horario
              </button>
              {rangos.length === 0 && <span style={{ color: "var(--gray)", fontSize: "0.85rem" }}>No atiende este día</span>}
            </div>
            {rangos.map((rango, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 110, marginBottom: 6 }}>
                <input type="time" value={rango.inicio} onChange={(e) => actualizarRango(dia.valor, i, "inicio", e.target.value)} style={{ width: 130 }} />
                <span style={{ color: "var(--gray)" }}>a</span>
                <input type="time" value={rango.fin} onChange={(e) => actualizarRango(dia.valor, i, "fin", e.target.value)} style={{ width: 130 }} />
                <button className="icon-btn" onClick={() => quitarRango(dia.valor, i)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        );
      })}

      <div className="err" style={{ color: msg.startsWith("Horario guardado") ? "var(--green)" : undefined }}>{msg}</div>
      <button className="btn" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando…" : "Guardar horario"}
      </button>
    </div>
  );
}
