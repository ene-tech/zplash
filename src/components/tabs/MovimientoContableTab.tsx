"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { subirComprobanteGasto } from "@/lib/db";
import { fmtCLP, todayYMD } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";

const CONTRAPARTE_LABEL: Record<MovimientoContable["tipo"], string> = {
  ingreso: "Cliente / Origen",
  egreso: "Nombre del Proveedor",
  cuenta_por_cobrar: "Cliente",
};

const ESTADO_EGRESO_LABEL: Record<string, string> = {
  pagado_cc: "Pagado desde CC",
  x_rendir: "X Rendir",
  pendiente_pago: "Pendiente de Pago",
};

const ESTADO_EGRESO_CLASE: Record<string, "ok" | "warn" | "bad"> = {
  pagado_cc: "ok",
  x_rendir: "warn",
  pendiente_pago: "bad",
};

function BuscadorGlosa({
  value,
  onChange,
  opciones,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: { categoria: string; grupo: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const q = value.trim().toLowerCase();
  const filtradas = q ? opciones.filter((o) => o.categoria.toLowerCase().includes(q)) : opciones;

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Escribe para buscar un tipo de gasto..."
      />
      {abierto && filtradas.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: "auto",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          {filtradas.map((o) => (
            <div
              key={o.categoria}
              onMouseDown={() => {
                onChange(o.categoria);
                setAbierto(false);
              }}
              style={{ padding: "8px 12px", cursor: "pointer" }}
            >
              <div>{o.categoria}</div>
              <div style={{ fontSize: 11, color: "var(--gray)" }}>{o.grupo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

export default function MovimientoContableTab({
  tipo,
  titulo,
}: {
  tipo: MovimientoContable["tipo"];
  titulo: string;
}) {
  const { data, commit } = useApp();
  const glosasGasto = data.categoriasGasto.filter((c) => c.activa).map((c) => ({ categoria: c.nombre, grupo: c.grupo }));
  const fechaRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLInputElement>(null);
  const [categoriaGasto, setCategoriaGasto] = useState("");
  const contraparteRef = useRef<HTMLInputElement>(null);
  const rutProveedorRef = useRef<HTMLInputElement>(null);
  const numeroFacturaRef = useRef<HTMLInputElement>(null);
  const [montoTexto, setMontoTexto] = useState("");
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const [tipoDocumento, setTipoDocumento] = useState<"Boleta" | "Factura" | null>(null);
  const [estado, setEstado] = useState<MovimientoContable["estado"]>(tipo === "egreso" ? "pagado_cc" : "pagado");
  const [archivo, setArchivo] = useState<File | null>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
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
  const totalPagado = items.filter((m) => m.estado === (tipo === "egreso" ? "pagado_cc" : "pagado")).reduce((s, m) => s + m.monto, 0);
  const totalXRendir = items.filter((m) => m.estado === "x_rendir").reduce((s, m) => s + m.monto, 0);
  const totalPendiente = items
    .filter((m) => m.estado === (tipo === "egreso" ? "pendiente_pago" : "pendiente"))
    .reduce((s, m) => s + m.monto, 0);

  const agregar = async () => {
    const fecha = fechaRef.current?.value || todayYMD();
    const descripcion = descripcionRef.current?.value.trim() || "";
    const categoria = tipo === "egreso" ? categoriaGasto.trim() : categoriaRef.current?.value.trim() || "";
    const contraparte = contraparteRef.current?.value.trim() || "";
    const rutProveedor = tipo === "egreso" ? rutProveedorRef.current?.value.trim() || "" : "";
    const numeroFactura = tipo === "egreso" ? numeroFacturaRef.current?.value.trim() || "" : "";
    const monto = Number(montoTexto || 0);
    const notas = notasRef.current?.value.trim() || "";

    if (!descripcion || !monto || monto <= 0) {
      setErr({ msg: "Completa la descripción y un monto válido", ok: false });
      return;
    }
    if (tipo === "egreso" && !glosasGasto.some((g) => g.categoria === categoria)) {
      setErr({ msg: "Selecciona un tipo de gasto de la lista", ok: false });
      return;
    }
    if (tipo === "egreso" && !tipoDocumento) {
      setErr({ msg: "Selecciona Boleta o Factura", ok: false });
      return;
    }

    const id = "mc" + Date.now() + Math.floor(Math.random() * 1000);
    let documentoUrl: string | undefined;
    let documentoNombre: string | undefined;
    if (tipo === "egreso" && archivo) {
      setSubiendo(true);
      const url = await subirComprobanteGasto(id, archivo);
      setSubiendo(false);
      if (!url) {
        setErr({ msg: "No se pudo subir el documento adjunto. Intenta de nuevo.", ok: false });
        return;
      }
      documentoUrl = url;
      documentoNombre = archivo.name;
    }

    const nuevo: MovimientoContable = {
      id,
      tipo,
      fecha: new Date(fecha + "T12:00:00").toISOString(),
      descripcion,
      categoria: categoria || undefined,
      contraparte: contraparte || undefined,
      rutProveedor: rutProveedor || undefined,
      numeroFactura: numeroFactura || undefined,
      tipoDocumento: tipoDocumento || undefined,
      documentoUrl,
      documentoNombre,
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
    setCategoriaGasto("");
    if (contraparteRef.current) contraparteRef.current.value = "";
    if (rutProveedorRef.current) rutProveedorRef.current.value = "";
    if (numeroFacturaRef.current) numeroFacturaRef.current.value = "";
    setMontoTexto("");
    if (notasRef.current) notasRef.current.value = "";
    setTipoDocumento(null);
    setArchivo(null);
    if (archivoInputRef.current) archivoInputRef.current.value = "";
    setEstado(tipo === "egreso" ? "pagado_cc" : "pagado");
  };

  const toggleEstado = (m: MovimientoContable) => {
    const actualizado: MovimientoContable = { ...m, estado: m.estado === "pagado" ? "pendiente" : "pagado" };
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
  };

  const cambiarEstadoEgreso = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado } : x)) });
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
            <BuscadorGlosa value={categoriaGasto} onChange={setCategoriaGasto} opciones={glosasGasto} />
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
        {tipo === "egreso" && (
          <div className="field">
            <label>Tipo de documento</label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className={tipoDocumento === "Boleta" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setTipoDocumento("Boleta")}
              >
                Boleta
              </button>
              <button
                type="button"
                className={tipoDocumento === "Factura" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setTipoDocumento("Factura")}
              >
                Factura
              </button>
            </div>
          </div>
        )}
        <div className="field">
          <label>{tipo === "egreso" ? "Monto Total (IVA Incl.)" : "Monto"}</label>
          <MontoInput value={montoTexto} onChange={setMontoTexto} />
        </div>
        {tipo === "egreso" && (
          <div className="field">
            <label>Adjuntar documento</label>
            <input
              ref={archivoInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </div>
        )}
        <div className="field">
          <label>Estado</label>
          <div style={{ display: "flex", gap: 10 }}>
            {tipo === "egreso" ? (
              <>
                <button
                  type="button"
                  className={estado === "pagado_cc" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setEstado("pagado_cc")}
                >
                  Pagado desde CC
                </button>
                <button
                  type="button"
                  className={estado === "x_rendir" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setEstado("x_rendir")}
                >
                  X Rendir
                </button>
                <button
                  type="button"
                  className={estado === "pendiente_pago" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setEstado("pendiente_pago")}
                >
                  Pendiente de Pago
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea ref={notasRef} rows={2} />
        </div>
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregar} disabled={subiendo}>
          {subiendo ? "Subiendo documento..." : "Registrar"}
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="num">{fmtCLP(total)}</div>
          <div className="lbl">Total</div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(totalPagado)}</div>
          <div className="lbl">{tipo === "egreso" ? "Pagado desde CC" : "Pagado"}</div>
        </div>
        {tipo === "egreso" && (
          <div className="stat-card">
            <div className="num">{fmtCLP(totalXRendir)}</div>
            <div className="lbl">X Rendir</div>
          </div>
        )}
        <div className="stat-card">
          <div className="num">{fmtCLP(totalPendiente)}</div>
          <div className="lbl">{tipo === "egreso" ? "Pendiente de Pago" : "Pendiente"}</div>
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
              {tipo === "egreso" && <th>Documento</th>}
              {tipo === "egreso" && <th>Adjunto</th>}
              <th>Monto</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={tipo === "egreso" ? 11 : 7}>
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
                  {tipo === "egreso" && <td>{m.tipoDocumento || "-"}</td>}
                  {tipo === "egreso" && (
                    <td>
                      {m.documentoUrl ? (
                        <a href={m.documentoUrl} target="_blank" rel="noopener noreferrer">
                          Ver
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                  <td>{fmtCLP(m.monto)}</td>
                  <td>
                    {tipo === "egreso" ? (
                      <span className={`status-pill ${ESTADO_EGRESO_CLASE[m.estado] || "warn"}`}>
                        {ESTADO_EGRESO_LABEL[m.estado] || m.estado}
                      </span>
                    ) : (
                      <span className={`status-pill ${m.estado === "pagado" ? "ok" : "warn"}`}>
                        {m.estado === "pagado" ? "Pagado" : "Pendiente"}
                      </span>
                    )}
                  </td>
                  <td className="row-actions">
                    {tipo === "egreso" ? (
                      <select
                        value={m.estado}
                        onChange={(e) => cambiarEstadoEgreso(m, e.target.value as MovimientoContable["estado"])}
                      >
                        <option value="pagado_cc">Pagado desde CC</option>
                        <option value="x_rendir">X Rendir</option>
                        <option value="pendiente_pago">Pendiente de Pago</option>
                      </select>
                    ) : (
                      <button className="icon-btn" onClick={() => toggleEstado(m)}>
                        {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                      </button>
                    )}
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
