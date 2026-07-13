"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { subirLiquidacionSueldo } from "@/lib/db";
import { RUT_FORMATO_MSG, fmtCLP, formatRut, isValidRut, mesActualKey, todayYMD, uid } from "@/lib/helpers";
import type { ColaboradorFicha, LiquidacionSueldo } from "@/types";

function MontoInput({ value, onChange }: { value: string; onChange: (digitos: string) => void }) {
  const formateado = value ? "$" + Number(value).toLocaleString("es-CL") : "";
  return (
    <input
      inputMode="numeric"
      value={formateado}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder="$0"
    />
  );
}

function FichaColaborador({ colaborador, onVolver }: { colaborador: ColaboradorFicha; onVolver: () => void }) {
  const { data, commit, patchUi } = useApp();
  const rutRef = useRef<HTMLInputElement>(null);
  const cargoRef = useRef<HTMLInputElement>(null);
  const fechaIngresoRef = useRef<HTMLInputElement>(null);
  const [sueldoBaseFicha, setSueldoBaseFicha] = useState(colaborador.sueldoBase ? String(colaborador.sueldoBase) : "");
  const [errFicha, setErrFicha] = useState<{ msg: string; ok: boolean } | null>(null);

  const periodoRef = useRef<HTMLInputElement>(null);
  const fechaPagoRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [sueldoBase, setSueldoBase] = useState(colaborador.sueldoBase ? String(colaborador.sueldoBase) : "");
  const [gratificacion, setGratificacion] = useState("");
  const [bonos, setBonos] = useState("");
  const [horasExtra, setHorasExtra] = useState("");
  const [descuentoAfp, setDescuentoAfp] = useState("");
  const [descuentoSalud, setDescuentoSalud] = useState("");
  const [descuentoImpuesto, setDescuentoImpuesto] = useState("");
  const [otrosDescuentos, setOtrosDescuentos] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const totalLiquido =
    Number(sueldoBase || 0) +
    Number(gratificacion || 0) +
    Number(bonos || 0) +
    Number(horasExtra || 0) -
    Number(descuentoAfp || 0) -
    Number(descuentoSalud || 0) -
    Number(descuentoImpuesto || 0) -
    Number(otrosDescuentos || 0);

  const liquidaciones = data.liquidacionesSueldo
    .filter((l) => l.perfilId === colaborador.id)
    .sort((a, b) => (a.periodo < b.periodo ? 1 : -1));

  const guardarFicha = async () => {
    const rut = rutRef.current?.value.trim() || "";
    if (rut && !isValidRut(rut)) {
      setErrFicha({ msg: RUT_FORMATO_MSG, ok: false });
      return;
    }
    const nueva: ColaboradorFicha = {
      id: colaborador.id,
      nombre: colaborador.nombre,
      icono: colaborador.icono,
      rut: rut ? formatRut(rut) : undefined,
      cargo: cargoRef.current?.value.trim() || undefined,
      fechaIngreso: fechaIngresoRef.current?.value ? new Date(fechaIngresoRef.current.value + "T12:00:00").toISOString() : null,
      sueldoBase: sueldoBaseFicha ? Number(sueldoBaseFicha) : undefined,
    };
    const ok = await commit({
      colaboradores: data.colaboradores.some((c) => c.id === colaborador.id)
        ? data.colaboradores.map((c) => (c.id === colaborador.id ? nueva : c))
        : [...data.colaboradores, nueva],
    });
    setErrFicha(ok ? { msg: "Ficha guardada", ok: true } : { msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
  };

  const agregarLiquidacion = async () => {
    const periodo = periodoRef.current?.value || "";
    const fechaPago = fechaPagoRef.current?.value || todayYMD();
    if (!periodo) {
      setErr({ msg: "Selecciona el período", ok: false });
      return;
    }
    if (liquidaciones.some((l) => l.periodo === periodo)) {
      setErr({ msg: "Ya existe una liquidación para ese período", ok: false });
      return;
    }

    const id = "liq" + Date.now() + Math.floor(Math.random() * 1000);
    let documentoUrl: string | undefined;
    let documentoNombre: string | undefined;
    if (archivo) {
      setSubiendo(true);
      const url = await subirLiquidacionSueldo(id, archivo);
      setSubiendo(false);
      if (!url) {
        setErr({ msg: "No se pudo subir el documento adjunto. Intenta de nuevo.", ok: false });
        return;
      }
      documentoUrl = url;
      documentoNombre = archivo.name;
    }

    const nueva: LiquidacionSueldo = {
      id,
      perfilId: colaborador.id,
      periodo,
      sueldoBase: Number(sueldoBase || 0),
      gratificacion: Number(gratificacion || 0),
      bonos: Number(bonos || 0),
      horasExtra: Number(horasExtra || 0),
      descuentoAfp: Number(descuentoAfp || 0),
      descuentoSalud: Number(descuentoSalud || 0),
      descuentoImpuesto: Number(descuentoImpuesto || 0),
      otrosDescuentos: Number(otrosDescuentos || 0),
      totalLiquido,
      fechaPago: new Date(fechaPago + "T12:00:00").toISOString(),
      documentoUrl,
      documentoNombre,
      notas: notasRef.current?.value.trim() || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: "Administración",
    };

    const ok = await commit({ liquidacionesSueldo: [nueva, ...data.liquidacionesSueldo] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Liquidación registrada correctamente", ok: true });
    if (periodoRef.current) periodoRef.current.value = "";
    if (fechaPagoRef.current) fechaPagoRef.current.value = "";
    if (notasRef.current) notasRef.current.value = "";
    if (archivoInputRef.current) archivoInputRef.current.value = "";
    setArchivo(null);
    setSueldoBase(colaborador.sueldoBase ? String(colaborador.sueldoBase) : "");
    setGratificacion("");
    setBonos("");
    setHorasExtra("");
    setDescuentoAfp("");
    setDescuentoSalud("");
    setDescuentoImpuesto("");
    setOtrosDescuentos("");
  };

  const eliminarLiquidacion = (l: LiquidacionSueldo) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar la liquidación de ${l.periodo} de ${colaborador.nombre}? Esta acción no se puede deshacer.`,
        onConfirm: () => {
          commit({ liquidacionesSueldo: data.liquidacionesSueldo.filter((x) => x.id !== l.id) });
        },
      },
    });
  };

  return (
    <div>
      <button className="btn ghost" style={{ marginBottom: 16 }} onClick={onVolver}>
        ← Volver
      </button>
      <h3 style={{ fontSize: 18, color: "var(--gold)", marginBottom: 4 }}>{colaborador.nombre}</h3>

      <div className="modal" style={{ maxWidth: 640, margin: "16px 0 24px 0" }}>
        <h3>Ficha del colaborador</h3>
        <div className="field">
          <label>RUT</label>
          <input ref={rutRef} defaultValue={colaborador.rut ? formatRut(colaborador.rut) : ""} placeholder="12.345.678-9" />
        </div>
        <div className="field">
          <label>Cargo</label>
          <input ref={cargoRef} defaultValue={colaborador.cargo || ""} placeholder="Ej: Operador de lavado" />
        </div>
        <div className="field">
          <label>Fecha de ingreso</label>
          <input
            ref={fechaIngresoRef}
            type="date"
            defaultValue={colaborador.fechaIngreso ? colaborador.fechaIngreso.slice(0, 10) : ""}
          />
        </div>
        <div className="field">
          <label>Sueldo base</label>
          <MontoInput value={sueldoBaseFicha} onChange={setSueldoBaseFicha} />
        </div>
        <div className="err" style={{ color: errFicha?.ok ? "var(--green)" : undefined }}>
          {errFicha?.msg || ""}
        </div>
        <button className="btn" onClick={guardarFicha}>
          Guardar ficha
        </button>
      </div>

      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>Agregar liquidación de sueldo</h3>
        <div className="field">
          <label>Período</label>
          <input ref={periodoRef} type="month" defaultValue={mesActualKey()} />
        </div>
        <div className="field">
          <label>Sueldo base</label>
          <MontoInput value={sueldoBase} onChange={setSueldoBase} />
        </div>
        <div className="field">
          <label>Gratificación</label>
          <MontoInput value={gratificacion} onChange={setGratificacion} />
        </div>
        <div className="field">
          <label>Bonos</label>
          <MontoInput value={bonos} onChange={setBonos} />
        </div>
        <div className="field">
          <label>Horas extra</label>
          <MontoInput value={horasExtra} onChange={setHorasExtra} />
        </div>
        <div className="field">
          <label>Descuento AFP</label>
          <MontoInput value={descuentoAfp} onChange={setDescuentoAfp} />
        </div>
        <div className="field">
          <label>Descuento salud</label>
          <MontoInput value={descuentoSalud} onChange={setDescuentoSalud} />
        </div>
        <div className="field">
          <label>Descuento impuesto</label>
          <MontoInput value={descuentoImpuesto} onChange={setDescuentoImpuesto} />
        </div>
        <div className="field">
          <label>Otros descuentos</label>
          <MontoInput value={otrosDescuentos} onChange={setOtrosDescuentos} />
        </div>
        <div className="field">
          <label>Fecha de pago</label>
          <input ref={fechaPagoRef} type="date" defaultValue={todayYMD()} />
        </div>
        <div className="field">
          <label>Documento (liquidación en PDF/Excel)</label>
          <input ref={archivoInputRef} type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea ref={notasRef} rows={2} />
        </div>
        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat-card ok">
            <div className="num">{fmtCLP(totalLiquido)}</div>
            <div className="lbl">Total líquido a pagar</div>
          </div>
        </div>
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregarLiquidacion} disabled={subiendo}>
          {subiendo ? "Subiendo..." : "Registrar liquidación"}
        </button>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Historial de liquidaciones</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Período</th>
              <th>Sueldo base</th>
              <th>Descuentos</th>
              <th>Total líquido</th>
              <th>Fecha de pago</th>
              <th>Documento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {liquidaciones.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">Sin liquidaciones registradas</div>
                </td>
              </tr>
            ) : (
              liquidaciones.map((l) => (
                <tr key={l.id}>
                  <td>{l.periodo}</td>
                  <td>{fmtCLP(l.sueldoBase)}</td>
                  <td>{fmtCLP(l.descuentoAfp + l.descuentoSalud + l.descuentoImpuesto + l.otrosDescuentos)}</td>
                  <td>{fmtCLP(l.totalLiquido)}</td>
                  <td>{new Date(l.fechaPago).toLocaleDateString("es-CL")}</td>
                  <td>
                    {l.documentoUrl ? (
                      <a href={l.documentoUrl} target="_blank" rel="noopener noreferrer">
                        Ver
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => eliminarLiquidacion(l)}>
                      Eliminar
                    </button>
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

export default function RemuneracionesTab() {
  const { data } = useApp();
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  const colaboradorPorId = new Map(data.colaboradores.map((c) => [c.id, c]));
  const colaboradores = [...data.perfiles]
    .map((p): ColaboradorFicha => colaboradorPorId.get(p.id) || { id: p.id, nombre: p.nombre, icono: p.icono })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const seleccionado = colaboradores.find((c) => c.id === seleccionadoId);
  if (seleccionado) {
    return <FichaColaborador colaborador={seleccionado} onVolver={() => setSeleccionadoId(null)} />;
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 10 }}>Remuneraciones</h3>
      <div className="stat-grid">
        {colaboradores.length === 0 ? (
          <div className="empty">No hay colaboradores (usuarios) registrados</div>
        ) : (
          colaboradores.map((c) => (
            <div
              key={c.id}
              className="stat-card"
              style={{ cursor: "pointer", textAlign: "left" }}
              onClick={() => setSeleccionadoId(c.id)}
            >
              <div className="num" style={{ fontSize: 17 }}>
                {c.icono ? c.icono + " " : ""}
                {c.nombre}
              </div>
              <div className="lbl">
                {c.cargo || "Sin cargo asignado"}
                {c.sueldoBase ? " · " + fmtCLP(c.sueldoBase) : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
