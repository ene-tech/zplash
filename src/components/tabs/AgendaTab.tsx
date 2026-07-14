"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, precioServicio, todayYMD, uid } from "@/lib/helpers";
import type { BloqueoAgenda, Cita, HorarioAgenda, Servicio } from "@/types";

const DIAS = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
  { valor: 0, nombre: "Domingo" },
];

const ESTADOS_CITA: { valor: Cita["estado"]; label: string }[] = [
  { valor: "pendiente", label: "Pendiente" },
  { valor: "confirmada", label: "Confirmada" },
  { valor: "completada", label: "Completada" },
  { valor: "cancelada", label: "Cancelada" },
  { valor: "no_asistio", label: "No asistió" },
];

function sumarDias(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// Vista de día (igual estructura que la Agenda de ConsultaPro: navegar
// día a día en vez de un calendario semanal completo). Cada cita lista los
// servicios ligados vía cita_servicios (equivalente a cita_procedimientos),
// no un nombre único.
function CitasDelDia() {
  const { data, commit } = useApp();
  const [fecha, setFecha] = useState(todayYMD());

  const nombresServicios = (ids: string[]) => {
    const nombres = ids.map((id) => data.servicios.find((s) => s.id === id)?.nombre).filter(Boolean);
    return nombres.length ? nombres.join(", ") : "—";
  };

  const citasDelDia = data.citas
    .filter((c) => c.fechaHora.slice(0, 10) === fecha)
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime());

  const cambiarEstado = (cita: Cita, estado: Cita["estado"]) => {
    commit({ citas: data.citas.map((c) => (c.id === cita.id ? { ...c, estado } : c)) });
  };

  return (
    <div className="modal" style={{ maxWidth: 780, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFecha(sumarDias(fecha, -1))}>
          ← Día anterior
        </button>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ flex: "0 0 auto" }} />
        <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFecha(sumarDias(fecha, 1))}>
          Día siguiente →
        </button>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Servicios</th>
              <th>Cliente</th>
              <th>Contacto</th>
              <th>Origen</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {citasDelDia.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">Sin citas agendadas ese día</div>
                </td>
              </tr>
            ) : (
              citasDelDia.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.fechaHora).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{nombresServicios(c.servicioIds)}</td>
                  <td>
                    {c.nombre} <span className="plate-tag">{c.patente}</span>
                  </td>
                  <td>{c.telefono || "-"}</td>
                  <td>
                    <span className={`status-pill ${c.origen === "publico" ? "warn" : "ok"}`}>
                      {c.origen === "publico" ? "Público" : "Interno"}
                    </span>
                  </td>
                  <td>
                    <select value={c.estado} onChange={(e) => cambiarEstado(c, e.target.value as Cita["estado"])}>
                      {ESTADOS_CITA.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiciosCatalogo() {
  const { data, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const duracionRef = useRef<HTMLInputElement>(null);
  const precioRef = useRef<HTMLInputElement>(null);

  const categorias = Array.from(new Set(data.servicios.map((s) => s.categoria || "Sin categoría")));

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    const duracion = Number(duracionRef.current?.value) || 0;
    if (!nombre) {
      setErr({ msg: "El nombre es obligatorio", ok: false });
      return;
    }
    if (duracion <= 0) {
      setErr({ msg: "La duración debe ser mayor a 0", ok: false });
      return;
    }
    const nuevo: Servicio = {
      id: uid(),
      nombre,
      categoria: categoriaRef.current?.value.trim() || undefined,
      duracionMinutos: duracion,
      activo: true,
    };
    const precioInicial = Number(precioRef.current?.value) || 0;
    const ok = await commit({
      servicios: [...data.servicios, nuevo],
      precios: { ...data.precios, [nuevo.id]: { normal: precioInicial, promo: 0 } },
    });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Servicio agregado correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (categoriaRef.current) categoriaRef.current.value = "";
    if (duracionRef.current) duracionRef.current.value = "";
    if (precioRef.current) precioRef.current.value = "";
  };

  const toggleActivo = (s: Servicio) => {
    commit({ servicios: data.servicios.map((x) => (x.id === s.id ? { ...x, activo: !x.activo } : x)) });
  };

  const cambiarDuracion = (s: Servicio, duracion: number) => {
    if (duracion <= 0) return;
    commit({ servicios: data.servicios.map((x) => (x.id === s.id ? { ...x, duracionMinutos: duracion } : x)) });
  };

  return (
    <div className="modal" style={{ maxWidth: 620, margin: "0 0 20px 0" }}>
      <h3>Servicios</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Catálogo compartido entre Servicios Adicionales (venta rápida) y la Agenda. La duración determina el largo del
        cupo al agendar (equivalente a un "procedimiento"); el precio se puede reajustar después desde Configuración.
      </div>

      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 6, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          {data.servicios
            .filter((s) => (s.categoria || "Sin categoría") === cat)
            .map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                  opacity: s.activo ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1 }}>{s.nombre}</div>
                <span style={{ fontSize: 13, color: "var(--gray)" }}>{fmtCLP(precioServicio(data.precios, s.id))}</span>
                <input
                  type="number"
                  min={5}
                  defaultValue={s.duracionMinutos}
                  onBlur={(e) => cambiarDuracion(s, Number(e.target.value))}
                  style={{ width: 70 }}
                  title="Duración en minutos"
                />
                <span style={{ fontSize: 12, color: "var(--gray)" }}>min</span>
                <button className="icon-btn" onClick={() => toggleActivo(s)}>
                  {s.activo ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            ))}
        </div>
      ))}

      <h3 style={{ marginTop: 18 }}>Nuevo servicio</h3>
      <div className="field">
        <label>Nombre</label>
        <input ref={nombreRef} placeholder="Ej: Encerado" />
      </div>
      <div className="field">
        <label>Categoría</label>
        <input ref={categoriaRef} placeholder="Ej: Servicios Adicionales" />
      </div>
      <div className="field">
        <label>Duración (minutos)</label>
        <input ref={duracionRef} type="number" min={5} defaultValue={30} />
      </div>
      <div className="field">
        <label>Precio inicial</label>
        <input ref={precioRef} type="number" min={0} />
      </div>
      <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
        {err?.msg || ""}
      </div>
      <button className="btn" onClick={agregar}>
        Agregar servicio
      </button>
    </div>
  );
}

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

function HorarioSemanal() {
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

function BloqueosPuntuales() {
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
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Horario</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.bloqueosAgenda.map((b) => (
                <tr key={b.id}>
                  <td>{b.fecha}</td>
                  <td>{b.todoElDia ? "Todo el día" : `${b.horaInicio} – ${b.horaFin}`}</td>
                  <td>{b.motivo || "-"}</td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => quitar(b.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AgendaTab() {
  const [seccion, setSeccion] = useState<"citas" | "servicios" | "horario">("citas");

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 20 }}>
        <div className={`tab ${seccion === "citas" ? "active" : ""}`} onClick={() => setSeccion("citas")}>
          Citas
        </div>
        <div className={`tab ${seccion === "servicios" ? "active" : ""}`} onClick={() => setSeccion("servicios")}>
          Servicios
        </div>
        <div className={`tab ${seccion === "horario" ? "active" : ""}`} onClick={() => setSeccion("horario")}>
          Horario y bloqueos
        </div>
      </div>

      {seccion === "citas" && <CitasDelDia />}
      {seccion === "servicios" && <ServiciosCatalogo />}
      {seccion === "horario" && (
        <>
          <HorarioSemanal />
          <BloqueosPuntuales />
        </>
      )}
    </div>
  );
}
