"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  claveTurnoZona,
  DIAS_ORDEN,
  DIAS_SEMANA,
  motivoFueraDeRegla,
  perfilesDelEquipo,
  TURNOS_ZONA,
} from "@/lib/helpers";
import type { ReglaOperador } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

/** El tope horario de cada operador: qué días aplica y entre qué horas puede
 * trabajar esos días ("Carlos, de lunes a viernes, hasta las 18:30, porque
 * estudia de noche"; el fin de semana se queda hasta el cierre). No es un
 * permiso del sistema sino una política de asignación: las tres pantallas que
 * reparten turnos —Horarios y Turnos, Apertura y Cierre y el creador de
 * horario— se niegan a asignarle un tramo que la rompa (ver
 * motivoFueraDeRegla). Sin regla = sin tope, que es como está todo el equipo
 * hasta que alguien cargue una. La misma regla lleva los vetos de apertura y
 * cierre: qué sector puede abrir o cerrar esa persona (ver vetados). */
export default function ReglasOperadorTab() {
  const { data, commit } = useApp();
  const funcionarios = perfilesDelEquipo(data.perfiles);
  const [perfilId, setPerfilId] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean; form: "tope" | "turnos" } | null>(null);

  // Igual que la ficha de contrato: el formulario es no controlado y se
  // remonta con key={perfilId}, así cada campo vuelve a tomar el valor de LA
  // regla de ese operador sin un efecto que sincronice cinco useState.
  const reglaEnEdicion = data.reglasOperador.find((r) => r.id === perfilId);
  const nombreDe = (id: string) => funcionarios.find((f) => f.id === id)?.nombre ?? "El funcionario";

  /** Los tramos ya asignados que rompen la regla. Cargar el tope no reescribe
   * el horario vigente, así que hay que poder verlos para ir a corregirlos. */
  const tramosEnConflicto = (r: ReglaOperador) =>
    data.turnosFuncionario.filter(
      (t) =>
        t.perfilId === r.id &&
        t.activo &&
        motivoFueraDeRegla([r], r.id, t.diaSemana, t.horaInicio, t.horaFin, t.turno, t.zona)
    );

  /** Guarda la fila del operador tocando SOLO lo que edita cada formulario: el
   * tope horario y los turnos de apertura/cierre son la misma fila pero se
   * guardan por separado. Una regla sin tope y sin vetos ya no dice nada, así
   * que se borra. */
  const guardarRegla = async (cambio: Partial<ReglaOperador>, form: "tope" | "turnos", msg: string) => {
    const regla: ReglaOperador = {
      id: perfilId,
      dias: [],
      horaDesde: "08:00",
      horaHasta: "19:00",
      ...reglaEnEdicion,
      ...cambio,
    };
    const resto = data.reglasOperador.filter((r) => r.id !== perfilId);
    const vacia = !regla.dias.length && !regla.vetados?.length;
    const ok = await commit({ reglasOperador: vacia ? resto : [...resto, regla] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false, form });
      return;
    }
    const conflictos = tramosEnConflicto(regla).length;
    setErr({
      msg: conflictos
        ? `${msg} Ojo: le quedan ${conflictos} tramo(s) ya asignado(s) que rompen su regla, corrígelos en Horarios y Turnos.`
        : msg,
      ok: true,
      form,
    });
  };

  const guardarTope = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!perfilId) {
      setErr({ msg: "Selecciona al operador", ok: false, form: "tope" });
      return;
    }
    const campos = new FormData(e.currentTarget);
    const dias = campos.getAll("dias").map(Number).sort();
    const horaDesde = String(campos.get("horaDesde") ?? "");
    const horaHasta = String(campos.get("horaHasta") ?? "");
    if (dias.length && horaHasta <= horaDesde) {
      setErr({ msg: "La hora de tope debe ser posterior a la de entrada", ok: false, form: "tope" });
      return;
    }
    await guardarRegla(
      { dias, horaDesde, horaHasta, notas: String(campos.get("notas") ?? "").trim() || undefined },
      "tope",
      dias.length
        ? `Tope horario de ${nombreDe(perfilId)} guardado.`
        : `${nombreDe(perfilId)} queda sin tope horario.`
    );
  };

  const guardarTurnos = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!perfilId) {
      setErr({ msg: "Selecciona al operador", ok: false, form: "turnos" });
      return;
    }
    // Los turnos que quedaron sin marcar son los que NO puede tomar.
    const puede = new FormData(e.currentTarget).getAll("puede").map(String);
    const vetados = TURNOS_ZONA.map((c) => claveTurnoZona(c.turno, c.zona)).filter((k) => !puede.includes(k));
    await guardarRegla(
      { vetados },
      "turnos",
      vetados.length
        ? `${nombreDe(perfilId)} ya no toma: ${TURNOS_ZONA.filter((c) => vetados.includes(claveTurnoZona(c.turno, c.zona)))
            .map((c) => c.label.toLowerCase())
            .join(", ")}.`
        : `${nombreDe(perfilId)} puede tomar cualquier apertura o cierre.`
    );
  };

  const quitar = async (r: ReglaOperador) => {
    const ok = await commit({ reglasOperador: data.reglasOperador.filter((x) => x.id !== r.id) });
    setErr(
      ok
        ? { msg: `${nombreDe(r.id)} queda sin tope horario y puede tomar cualquier turno.`, ok: true, form: "tope" }
        : { msg: "No se pudo quitar la regla (sin conexión).", ok: false, form: "tope" }
    );
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Acá se fija hasta dónde puede llegar el horario de cada operador: los días en que <em>aplica</em> la regla y la
        ventana dentro de la que puede trabajar esos días. Los días que no marques quedan sin tope — así, alguien que
        estudia de noche puede tener la regla de lunes a viernes hasta las 18:30 y el fin de semana quedarse hasta el
        cierre. Con la regla cargada, ni <strong>Horarios y Turnos</strong>, ni <strong>Apertura y Cierre</strong>, ni
        el creador de horario le van a asignar un turno que la rompa. Quien no tenga regla no tiene tope. Aparte del tope va
        <strong> Apertura y cierre</strong>, que se guarda por separado: lo que desmarques ahí tampoco se le asigna, así
        queda fuera de la apertura o el cierre del sector que no le corresponda aunque su horario dé.
      </div>

      <h3>Reglas del equipo</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operador</TableHead>
              <TableHead>Días con tope</TableHead>
              <TableHead>Esos días</TableHead>
              <TableHead>Apertura y cierre</TableHead>
              <TableHead>Turnos que la rompen</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {funcionarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">Ningún perfil tiene el módulo Operador ni Mi Entorno asignado todavía</div>
                </TableCell>
              </TableRow>
            ) : (
              funcionarios.map((f) => {
                const r = data.reglasOperador.find((x) => x.id === f.id);
                const conflictos = r ? tramosEnConflicto(r) : [];
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.nombre}</TableCell>
                    <TableCell>
                      {r?.dias.length ? (
                        DIAS_ORDEN.filter((d) => r.dias.includes(d)).map((d) => DIAS_SEMANA[d].slice(0, 3)).join(", ")
                      ) : (
                        <span style={{ color: "var(--gray)" }}>Sin tope</span>
                      )}
                    </TableCell>
                    <TableCell>{r?.dias.length ? `de ${r.horaDesde} a ${r.horaHasta}` : "-"}</TableCell>
                    <TableCell style={{ fontSize: 12 }}>
                      {!r?.vetados?.length ? (
                        <span style={{ color: "var(--gray)" }}>Puede tomar todos</span>
                      ) : (
                        TURNOS_ZONA.filter((c) => r.vetados!.includes(claveTurnoZona(c.turno, c.zona))).map((c) => (
                          <div key={c.label} className="plate-tag warn" style={{ marginBottom: 4 }}>
                            No: {c.label}
                          </div>
                        ))
                      )}
                    </TableCell>
                    <TableCell>
                      {conflictos.length === 0 ? (
                        <span style={{ color: "var(--gray)" }}>-</span>
                      ) : (
                        conflictos.map((t) => (
                          <div key={t.id} className="plate-tag warn" style={{ marginBottom: 4 }}>
                            {DIAS_SEMANA[t.diaSemana].slice(0, 3)} {t.horaInicio}-{t.horaFin}
                          </div>
                        ))
                      )}
                    </TableCell>
                    <TableCell style={{ color: "var(--gray)", fontSize: 12 }}>{r?.notas || "-"}</TableCell>
                    <TableCell>
                      {r && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Quitar la regla"
                          aria-label={`Quitar la regla de ${f.nombre}`}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => quitar(r)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <h3 style={{ marginTop: 28 }}>Reglas de un operador</h3>
      <div className="field" style={{ maxWidth: 260 }}>
        <label>Operador</label>
        <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)}>
          <option value="">Selecciona…</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Dos cosas distintas y por eso dos formularios con su propio Guardar:
          el tope horario dice hasta qué hora puede trabajar; los turnos, qué
          sector puede abrir o cerrar. Guardar uno no toca lo del otro.
          key={perfilId}: al cambiar de operador cada formulario se remonta y
          sus campos vuelven a tomar el valor de SU regla. */}
      <h4 style={{ fontSize: 14, color: "var(--gold)", margin: "18px 0 4px" }}>Tope horario</h4>
      <form key={`tope-${perfilId}`} onSubmit={guardarTope}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field">
            <label>Días en que aplica el tope</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {DIAS_ORDEN.map((i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    name="dias"
                    value={i}
                    defaultChecked={reglaEnEdicion ? reglaEnEdicion.dias.includes(i) : i >= 1 && i <= 5}
                    style={{ width: "auto" }}
                  />
                  {DIAS_SEMANA[i].slice(0, 3)}
                </label>
              ))}
            </div>
          </div>
          <div className="field" style={{ minWidth: 130 }}>
            <label>Esos días no entra antes de</label>
            <input name="horaDesde" type="time" defaultValue={reglaEnEdicion?.horaDesde || "08:00"} />
          </div>
          <div className="field" style={{ minWidth: 130 }}>
            <label>Esos días no se queda después de</label>
            <input name="horaHasta" type="time" defaultValue={reglaEnEdicion?.horaHasta || "19:00"} />
          </div>
          <div className="field" style={{ minWidth: 240, flex: 1 }}>
            <label>Notas (opcional)</label>
            <input name="notas" defaultValue={reglaEnEdicion?.notas || ""} placeholder="Ej: estudia de noche" />
          </div>
        </div>
        {err?.form === "tope" && (
          <div className="err" style={{ color: err.ok ? "var(--green)" : undefined }}>
            {err.msg}
          </div>
        )}
        <Button type="submit">Guardar tope horario</Button>
      </form>

      <h4 style={{ fontSize: 14, color: "var(--gold)", margin: "22px 0 4px" }}>Apertura y cierre</h4>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 8 }}>
        Desmarca lo que esta persona <em>no</em> puede tomar. Vale todos los días y no depende de su horario.
      </div>
      <form key={`turnos-${perfilId}`} onSubmit={guardarTurnos}>
        <div className="field">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TURNOS_ZONA.map((c) => {
              const clave = claveTurnoZona(c.turno, c.zona);
              return (
                <label key={clave} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    name="puede"
                    value={clave}
                    defaultChecked={!reglaEnEdicion?.vetados?.includes(clave)}
                    style={{ width: "auto" }}
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </div>
        {err?.form === "turnos" && (
          <div className="err" style={{ color: err.ok ? "var(--green)" : undefined }}>
            {err.msg}
          </div>
        )}
        <Button type="submit">Guardar apertura y cierre</Button>
      </form>
    </div>
  );
}
