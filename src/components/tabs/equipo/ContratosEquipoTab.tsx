"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { fmtFecha, perfilesDelEquipo } from "@/lib/helpers";
import type { ContratoFuncionario } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const TIPOS_CONTRATO = ["Indefinido", "Plazo fijo", "Part-time", "Por obra o faena", "Honorarios"];

/** Ficha de contrato de cada funcionario. La llena quien administra; el
 * funcionario ve solo la suya, de solo lectura, en Mi Entorno. Sin
 * remuneración a propósito — ver el comentario de contratos_funcionario en el
 * esquema. */
export default function ContratosEquipoTab() {
  const { data, commit } = useAppData();
  const funcionarios = perfilesDelEquipo(data.perfiles);
  const [perfilId, setPerfilId] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  // El formulario es no controlado y se remonta con key={perfilId} (ver más
  // abajo): al cambiar de funcionario, cada campo vuelve a tomar su
  // defaultValue del contrato de ese perfil, sin un efecto que sincronice
  // siete useState (ver react-hooks/set-state-in-effect). Editar es
  // sobrescribir la misma fila, porque el id del contrato ES el id del perfil.
  const contratoEnEdicion = data.contratosFuncionario.find((c) => c.id === perfilId);

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!perfilId) {
      setErr({ msg: "Selecciona al funcionario", ok: false });
      return;
    }
    const campos = new FormData(e.currentTarget);
    const texto = (nombre: string) => String(campos.get(nombre) ?? "").trim();
    const cargo = texto("cargo");
    const fechaInicio = texto("fechaInicio");
    const fechaTermino = texto("fechaTermino");
    const jornada = texto("jornada");
    if (!cargo) {
      setErr({ msg: "Escribe el cargo", ok: false });
      return;
    }
    if (!fechaInicio) {
      setErr({ msg: "Indica la fecha de inicio del contrato", ok: false });
      return;
    }
    if (fechaTermino && fechaTermino < fechaInicio) {
      setErr({ msg: "La fecha de término no puede ser anterior a la de inicio", ok: false });
      return;
    }
    const horas = jornada ? Number(jornada) : undefined;
    if (horas != null && (!Number.isFinite(horas) || horas <= 0 || horas > 60)) {
      setErr({ msg: "La jornada debe ser un número de horas entre 1 y 60", ok: false });
      return;
    }
    const contrato: ContratoFuncionario = {
      id: perfilId,
      cargo,
      tipoContrato: texto("tipoContrato"),
      jornadaHorasSemana: horas,
      fechaInicio,
      fechaTermino: fechaTermino || undefined,
      documentoUrl: texto("documentoUrl") || undefined,
      notas: texto("notas") || undefined,
      actualizadoEn: new Date().toISOString(),
    };
    const resto = data.contratosFuncionario.filter((c) => c.id !== perfilId);
    const ok = await commit({ contratosFuncionario: [...resto, contrato] });
    setErr(
      ok
        ? { msg: `Contrato de ${data.perfiles.find((x) => x.id === perfilId)?.nombre ?? "el funcionario"} guardado`, ok: true }
        : { msg: "No se pudo guardar el contrato (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Ficha referencial del contrato de cada funcionario: es lo que él ve en Mi Entorno. La remuneración y los anexos
        no se registran acá.
      </div>

      <h3>Contratos del equipo</h3>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionario</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Jornada</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Término</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funcionarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="empty">Ningún perfil tiene el módulo Operador ni Mi Entorno asignado todavía</div>
                </TableCell>
              </TableRow>
            ) : (
              funcionarios.map((f) => {
                const c = data.contratosFuncionario.find((x) => x.id === f.id);
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.nombre}</TableCell>
                    <TableCell>{c?.cargo || <span style={{ color: "var(--gray)" }}>Sin contrato</span>}</TableCell>
                    <TableCell>{c?.tipoContrato || "-"}</TableCell>
                    <TableCell>{c?.jornadaHorasSemana ? `${c.jornadaHorasSemana} h` : "-"}</TableCell>
                    <TableCell>{c ? fmtFecha(c.fechaInicio) : "-"}</TableCell>
                    <TableCell>{c?.fechaTermino ? fmtFecha(c.fechaTermino) : "-"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <h3 style={{ marginTop: 28 }}>Registrar o actualizar contrato</h3>
      <div className="field" style={{ maxWidth: 260 }}>
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
      {/* key={perfilId}: al cambiar de funcionario el formulario se
          remonta y cada campo vuelve a tomar el valor de SU contrato. */}
      <form key={perfilId} onSubmit={guardar}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 200, flex: 1 }}>
            <label>Cargo</label>
            <input name="cargo" defaultValue={contratoEnEdicion?.cargo || ""} placeholder="Ej: Operador de túnel" />
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label>Tipo de contrato</label>
            <select name="tipoContrato" defaultValue={contratoEnEdicion?.tipoContrato || TIPOS_CONTRATO[0]}>
              {TIPOS_CONTRATO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label>Jornada (h semanales)</label>
            <input
              name="jornada"
              type="number"
              min={1}
              max={60}
              defaultValue={contratoEnEdicion?.jornadaHorasSemana ?? ""}
            />
          </div>
          <div className="field" style={{ minWidth: 150 }}>
            <label>Inicio</label>
            <input name="fechaInicio" type="date" defaultValue={contratoEnEdicion?.fechaInicio || ""} />
          </div>
          <div className="field" style={{ minWidth: 150 }}>
            <label>Término (opcional)</label>
            <input name="fechaTermino" type="date" defaultValue={contratoEnEdicion?.fechaTermino || ""} />
          </div>
          <div className="field" style={{ minWidth: 240, flex: 1 }}>
            <label>Link al contrato firmado (opcional)</label>
            <input name="documentoUrl" defaultValue={contratoEnEdicion?.documentoUrl || ""} placeholder="https://…" />
          </div>
          <div className="field" style={{ minWidth: 240, flex: 1 }}>
            <label>Notas (opcional)</label>
            <textarea name="notas" rows={2} defaultValue={contratoEnEdicion?.notas || ""} />
          </div>
        </div>
        {err && (
          <div className="err" style={{ color: err.ok ? "var(--green)" : undefined }}>
            {err.msg}
          </div>
        )}
        <Button type="submit">{contratoEnEdicion ? "Actualizar contrato" : "Guardar contrato"}</Button>
      </form>
    </div>
  );
}
