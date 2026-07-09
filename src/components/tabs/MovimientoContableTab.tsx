"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, GASTO_GRUPOS, todayYMD } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";

const CONTRAPARTE_LABEL: Record<MovimientoContable["tipo"], string> = {
  ingreso: "Cliente / Origen",
  egreso: "Nombre del Proveedor",
  cuenta_por_cobrar: "Cliente",
  cuenta_por_pagar: "Proveedor",
};

export default function MovimientoContableTab({
  tipo,
  titulo,
}: {
  tipo: MovimientoContable["tipo"];
  titulo: string;
}) {
  const { data, commit } = useApp();
  const fechaRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const categoriaSelectRef = useRef<HTMLSelectElement>(null);
  const contraparteRef = useRef<HTMLInputElement>(null);
  const rutProveedorRef = useRef<HTMLInputElement>(null);
  const numeroFacturaRef = useRef<HTMLInputElement>(null);
  const montoRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const [estado, setEstado] = useState<"pagado" | "pendiente">("pagado");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const items = data.movimientosContables
    .filter((m) => m.tipo === tipo)
    .filter((m) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        m.descripcion.toLowerCase().includes(q) ||
        (m.categoria || "").toLowerCase().includes(q) ||
        (m.contraparte || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const total = items.reduce((s, m) => s + m.monto, 0);
  const totalPagado = items.filter((m) => m.estado === "pagado").reduce((s, m) => s + m.monto, 0);
  const totalPendiente = items.filter((m) => m.estado === "pendiente").reduce((s, m) => s + m.monto, 0);

  const agregar = async () => {
    const fecha = fechaRef.current?.value || todayYMD();
    const descripcion = descripcionRef.current?.value.trim() || "";
    const categoria = tipo === "egreso" ? categoriaSelectRef.current?.value || "" : categoriaRef.current?.value.trim() || "";
    const contraparte = contraparteRef.current?.value.trim() || "";
    const rutProveedor = tipo === "egreso" ? rutProveedorRef.current?.value.trim() || "" : "";
    const numeroFactura = tipo === "egreso" ? numeroFacturaRef.current?.value.trim() || "" : "";
    const monto = Number(montoRef.current?.value || 0);
    const notas = notasRef.current?.value.trim() || "";

    if (!descripcion || !monto || monto <= 0) {
      setErr({ msg: "Completa la descripción y un monto válido", ok: false });
      return;
    }
    if (tipo === "egreso" && !categoria) {
      setErr({ msg: "Selecciona un tipo de gasto", ok: false });
      return;
    }

    const nuevo: MovimientoContable = {
      id: "mc" + Date.now() + Math.floor(Math.random() * 1000),
      tipo,
      fecha: new Date(fecha + "T12:00:00").toISOString(),
      descripcion,
      categoria: categoria || undefined,
      contraparte: contraparte || undefined,
      rutProveedor: rutProveedor || undefined,
      numeroFactura: numeroFactura || undefined,
      monto,
      estado,
      notas: notas || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: "Administración",
    };

    const ok = await commit({ movimientosContables: [nuevo, ...data.movimientosContables] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Movimiento registrado correctamente", ok: true });
    if (fechaRef.current) fechaRef.current.value = "";
    if (descripcionRef.current) descripcionRef.current.value = "";
    if (categoriaRef.current) categoriaRef.current.value = "";
    if (categoriaSelectRef.current) categoriaSelectRef.current.value = "";
    if (contraparteRef.current) contraparteRef.current.value = "";
    if (rutProveedorRef.current) rutProveedorRef.current.value = "";
    if (numeroFacturaRef.current) numeroFacturaRef.current.value = "";
    if (montoRef.current) montoRef.current.value = "";
    if (notasRef.current) notasRef.current.value = "";
    setEstado("pagado");
  };

  const toggleEstado = (m: MovimientoContable) => {
    const actualizado: MovimientoContable = { ...m, estado: m.estado === "pagado" ? "pendiente" : "pagado" };
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 520, margin: "0 0 24px 0" }}>
        <h3>Registrar {titulo.toLowerCase()}</h3>
        <div className="field">
          <label>Fecha</label>
          <input ref={fechaRef} type="date" defaultValue={todayYMD()} />
        </div>
        <div className="field">
          <label>Descripción</label>
          <input ref={descripcionRef} placeholder="Ej: Pago de arriendo local" />
        </div>
        <div className="field">
          <label>{tipo === "egreso" ? "Tipo de gasto" : "Categoría"}</label>
          {tipo === "egreso" ? (
            <select ref={categoriaSelectRef} defaultValue="">
              <option value="" disabled>
                Selecciona un tipo de gasto
              </option>
              {GASTO_GRUPOS.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <input ref={categoriaRef} placeholder="Ej: Arriendo, Insumos, Sueldos..." />
          )}
        </div>
        {tipo === "egreso" && (
          <div className="field">
            <label>Rut proveedor</label>
            <input ref={rutProveedorRef} placeholder="Ej: 76.543.210-K" />
          </div>
        )}
        <div className="field">
          <label>{CONTRAPARTE_LABEL[tipo]}</label>
          <input ref={contraparteRef} />
        </div>
        {tipo === "egreso" && (
          <div className="field">
            <label>N° de factura</label>
            <input ref={numeroFacturaRef} />
          </div>
        )}
        <div className="field">
          <label>{tipo === "egreso" ? "Monto Total (IVA Incl.)" : "Monto"}</label>
          <input ref={montoRef} type="number" min={0} placeholder="0" />
        </div>
        <div className="field">
          <label>Estado</label>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className={estado === "pagado" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => setEstado("pagado")}
            >
              Pagado
            </button>
            <button
              type="button"
              className={estado === "pendiente" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => setEstado("pendiente")}
            >
              Pendiente
            </button>
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea ref={notasRef} rows={2} />
        </div>
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregar}>
          Registrar
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="num">{fmtCLP(total)}</div>
          <div className="lbl">Total</div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(totalPagado)}</div>
          <div className="lbl">Pagado</div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(totalPendiente)}</div>
          <div className="lbl">Pendiente</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, categoría o contraparte..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Categoría</th>
              {tipo === "egreso" && <th>RUT</th>}
              <th>{CONTRAPARTE_LABEL[tipo]}</th>
              {tipo === "egreso" && <th>N° Factura</th>}
              <th>Monto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={tipo === "egreso" ? 9 : 7}>
                  <div className="empty">Sin registros</div>
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.fecha).toLocaleDateString("es-CL")}</td>
                  <td>{m.descripcion}</td>
                  <td>{m.categoria || "-"}</td>
                  {tipo === "egreso" && <td>{m.rutProveedor || "-"}</td>}
                  <td>{m.contraparte || "-"}</td>
                  {tipo === "egreso" && <td>{m.numeroFactura || "-"}</td>}
                  <td>{fmtCLP(m.monto)}</td>
                  <td>
                    <span className={`status-pill ${m.estado === "pagado" ? "ok" : "warn"}`}>
                      {m.estado === "pagado" ? "Pagado" : "Pendiente"}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => toggleEstado(m)}>
                      {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                    </button>
                    <button className="icon-btn" onClick={() => eliminar(m)}>
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
