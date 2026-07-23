"use client";

import { useRef, useState } from "react";
import { Buscador } from "@/components/Buscador";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import { subirComprobanteGasto } from "@/lib/db";
import {
  CANAL_INGRESO_OTROS,
  CANAL_INGRESO_TUNEL,
  RUT_FORMATO_MSG,
  esEstadoPagadoEgreso,
  fmtCLP,
  formatRut,
  isValidRut,
  todayYMD,
} from "@/lib/helpers";
import type { MovimientoContable, PagoInfo } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Trash2 } from "lucide-react";

const CONTRAPARTE_LABEL: Record<MovimientoContable["tipo"], string> = {
  ingreso: "Cliente / Origen",
  egreso: "Nombre del Proveedor",
  cuenta_por_cobrar: "Cliente",
};

const ESTADO_EGRESO_LABEL: Record<string, string> = {
  pagado_cc: "Pagado desde CC",
  pagado_efectivo: "Pagado en Efectivo",
  x_rendir: "X Rendir",
  pendiente_pago: "Pendiente de Pago",
};

const ESTADO_EGRESO_CLASE: Record<string, "ok" | "warn" | "bad"> = {
  pagado_cc: "ok",
  pagado_efectivo: "ok",
  x_rendir: "warn",
  pendiente_pago: "bad",
};

export default function MovimientoContableTab({
  tipo,
  titulo,
}: {
  tipo: MovimientoContable["tipo"];
  titulo: string;
}) {
  const { data, commit, patchUi } = useApp();
  const glosasGasto = data.categoriasGasto.filter((c) => c.activa).map((c) => ({ categoria: c.nombre, grupo: c.grupo }));
  const canalesIngreso = data.categoriasIngreso.filter((c) => c.activa);
  const fechaRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);
  const [categoriaGasto, setCategoriaGasto] = useState("");
  const [categoriaIngreso, setCategoriaIngreso] = useState("");
  const [comentarioOtros, setComentarioOtros] = useState("");
  const contraparteRef = useRef<HTMLInputElement>(null);
  const rutProveedorRef = useRef<HTMLInputElement>(null);
  const numeroFacturaRef = useRef<HTMLInputElement>(null);
  const [montoTexto, setMontoTexto] = useState("");
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const [tipoDocumento, setTipoDocumento] = useState<"Boleta" | "Factura" | null>(null);
  const [estado, setEstado] = useState<MovimientoContable["estado"]>(tipo === "egreso" ? "pagado_cc" : "pagado");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
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

  const estadoBloqueadoPagado = tipo === "ingreso" && categoriaIngreso === CANAL_INGRESO_TUNEL;

  const total = items.reduce((s, m) => s + m.monto, 0);
  const totalPagado = items
    .filter((m) => (tipo === "egreso" ? m.estado === "pagado_cc" || m.estado === "pagado_efectivo" : m.estado === "pagado"))
    .reduce((s, m) => s + m.monto, 0);
  const totalXRendir = items.filter((m) => m.estado === "x_rendir").reduce((s, m) => s + m.monto, 0);
  const totalPendiente = items
    .filter((m) => m.estado === (tipo === "egreso" ? "pendiente_pago" : "pendiente"))
    .reduce((s, m) => s + m.monto, 0);

  const cierreDiario =
    tipo === "ingreso"
      ? Object.values(
          items.reduce<Record<string, { dia: string; cantidad: number; efectivo: number; tarjeta: number; transferencia: number; pendiente: number; total: number }>>(
            (acc, m) => {
              const dia = m.fecha.slice(0, 10);
              if (!acc[dia]) acc[dia] = { dia, cantidad: 0, efectivo: 0, tarjeta: 0, transferencia: 0, pendiente: 0, total: 0 };
              acc[dia].cantidad += 1;
              acc[dia].total += m.monto;
              if (m.estado === "pagado") {
                if (m.metodoPago === "efectivo") acc[dia].efectivo += m.monto;
                else if (m.metodoPago === "tarjeta") acc[dia].tarjeta += m.monto;
                else if (m.metodoPago === "transferencia") acc[dia].transferencia += m.monto;
              } else {
                acc[dia].pendiente += m.monto;
              }
              return acc;
            },
            {}
          )
        ).sort((a, b) => (a.dia < b.dia ? 1 : -1))
      : [];

  const agregar = async () => {
    const fecha = fechaRef.current?.value || todayYMD();
    const categoria =
      tipo === "egreso"
        ? categoriaGasto.trim()
        : categoriaIngreso === CANAL_INGRESO_OTROS
          ? comentarioOtros.trim()
            ? `${CANAL_INGRESO_OTROS}: ${comentarioOtros.trim()}`
            : CANAL_INGRESO_OTROS
          : categoriaIngreso;
    const contraparte = contraparteRef.current?.value.trim() || "";
    const descripcion =
      tipo === "ingreso" ? categoria + (contraparte ? ` – ${contraparte}` : "") : descripcionRef.current?.value.trim() || "";
    const rutProveedor = tipo === "egreso" ? rutProveedorRef.current?.value.trim() || "" : "";
    const numeroFactura = tipo === "egreso" ? numeroFacturaRef.current?.value.trim() || "" : "";
    const monto = Number(montoTexto || 0);
    const notas = notasRef.current?.value.trim() || "";

    if (tipo === "egreso" && !descripcion) {
      setErr({ msg: "Completa la descripción", ok: false });
      return;
    }
    if (tipo === "egreso" && !glosasGasto.some((g) => g.categoria === categoria)) {
      setErr({ msg: "Selecciona un tipo de gasto de la lista", ok: false });
      return;
    }
    if (tipo === "ingreso" && !categoriaIngreso) {
      setErr({ msg: "Selecciona una categoría", ok: false });
      return;
    }
    if (!monto || monto <= 0) {
      setErr({ msg: "Ingresa un monto válido", ok: false });
      return;
    }
    if (tipo === "egreso" && !tipoDocumento) {
      setErr({ msg: "Selecciona Boleta o Factura", ok: false });
      return;
    }
    if (rutProveedor && !isValidRut(rutProveedor)) {
      setErr({ msg: RUT_FORMATO_MSG, ok: false });
      return;
    }
    if (tipo === "ingreso" && estado === "pagado" && !metodoPago) {
      setErr({ msg: "Selecciona Efectivo, Tarjeta o Transferencia bancaria", ok: false });
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
      rutProveedor: rutProveedor ? formatRut(rutProveedor) : undefined,
      numeroFactura: numeroFactura || undefined,
      tipoDocumento: tipoDocumento || undefined,
      documentoUrl,
      documentoNombre,
      monto,
      estado: estadoBloqueadoPagado ? "pagado" : estado,
      metodoPago: tipo === "ingreso" && estado === "pagado" ? metodoPago || undefined : undefined,
      notas: notas || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: "Administración",
      fechaPago: tipo === "egreso" && esEstadoPagadoEgreso(estado) ? new Date().toISOString() : undefined,
    };

    const ok = await commit({ movimientosContables: [nuevo, ...data.movimientosContables] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Movimiento registrado correctamente", ok: true });
    if (fechaRef.current) fechaRef.current.value = "";
    if (descripcionRef.current) descripcionRef.current.value = "";
    setCategoriaGasto("");
    setCategoriaIngreso("");
    setComentarioOtros("");
    if (contraparteRef.current) contraparteRef.current.value = "";
    if (rutProveedorRef.current) rutProveedorRef.current.value = "";
    if (numeroFacturaRef.current) numeroFacturaRef.current.value = "";
    setMontoTexto("");
    if (notasRef.current) notasRef.current.value = "";
    setTipoDocumento(null);
    setArchivo(null);
    if (archivoInputRef.current) archivoInputRef.current.value = "";
    setEstado(tipo === "egreso" ? "pagado_cc" : "pagado");
    setMetodoPago(null);
  };

  const toggleEstado = (m: MovimientoContable) => {
    if (m.estado === "pagado") {
      const actualizado: MovimientoContable = { ...m, estado: "pendiente", metodoPago: undefined };
      commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
      return;
    }
    patchUi({
      modal: {
        type: "pago",
        monto: m.monto,
        descripcion: m.descripcion,
        onConfirm: (pago: PagoInfo) => {
          const actualizado: MovimientoContable = { ...m, estado: "pagado", metodoPago: pago.metodo };
          commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
        },
      },
    });
  };

  const cambiarEstadoEgreso = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    const fechaPago = esEstadoPagadoEgreso(nuevoEstado) ? new Date().toISOString() : undefined;
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado, fechaPago } : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 520, margin: "0 0 24px 0" }}>
        <h3>Registrar {titulo.toLowerCase()}</h3>
        <div className="field">
          <label>{tipo === "egreso" ? "Fecha de Emisión" : "Fecha"}</label>
          <input ref={fechaRef} type="date" defaultValue={todayYMD()} />
        </div>
        {tipo === "egreso" && (
          <div className="field">
            <label>Descripción</label>
            <input ref={descripcionRef} placeholder="Ej: Pago de arriendo local" />
          </div>
        )}
        <div className="field">
          <label>{tipo === "egreso" ? "Tipo de gasto" : "Categoría"}</label>
          {tipo === "egreso" ? (
            <Buscador
              value={categoriaGasto}
              onChange={setCategoriaGasto}
              opciones={glosasGasto}
              placeholder="Escribe para buscar un tipo de gasto..."
            />
          ) : (
            <>
              <select
                value={categoriaIngreso}
                onChange={(e) => {
                  const v = e.target.value;
                  setCategoriaIngreso(v);
                  if (v === CANAL_INGRESO_TUNEL) setEstado("pagado");
                }}
              >
                <option value="">Selecciona una categoría...</option>
                {canalesIngreso.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              {categoriaIngreso === CANAL_INGRESO_OTROS && (
                <textarea
                  value={comentarioOtros}
                  onChange={(e) => setComentarioOtros(e.target.value)}
                  placeholder="Escribe un comentario..."
                  rows={2}
                  style={{ marginTop: 8 }}
                />
              )}
            </>
          )}
        </div>
        {tipo === "egreso" && (
          <div className="field">
            <label>Rut proveedor</label>
            <input
              ref={rutProveedorRef}
              placeholder="Ej: 76.543.210-K"
              onBlur={(e) => {
                if (e.target.value.trim()) e.target.value = formatRut(e.target.value);
              }}
            />
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
          <PriceInput value={montoTexto} onChange={setMontoTexto} />
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
                  className={estado === "pagado_efectivo" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setEstado("pagado_efectivo")}
                >
                  Efectivo
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
                {!estadoBloqueadoPagado && (
                  <button
                    type="button"
                    className={estado === "pendiente" ? "btn" : "btn ghost"}
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => {
                      setEstado("pendiente");
                      setMetodoPago(null);
                    }}
                  >
                    Pendiente
                  </button>
                )}
              </>
            )}
          </div>
          {estadoBloqueadoPagado && (
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 6 }}>
              Los ingresos de Servicios de Lavado / Túnel se registran siempre como Pagado.
            </div>
          )}
        </div>
        {tipo === "ingreso" && estado === "pagado" && (
          <div className="field">
            <label>Método de pago</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={metodoPago === "efectivo" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setMetodoPago("efectivo")}
              >
                Efectivo
              </button>
              <button
                type="button"
                className={metodoPago === "tarjeta" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setMetodoPago("tarjeta")}
              >
                Tarjeta
              </button>
              <button
                type="button"
                className={metodoPago === "transferencia" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setMetodoPago("transferencia")}
              >
                Transferencia bancaria
              </button>
            </div>
          </div>
        )}
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
        <div className="stat-card ok">
          <div className="num">{fmtCLP(totalPagado)}</div>
          <div className="lbl">Pagado</div>
        </div>
        {tipo === "egreso" && (
          <div className="stat-card warn">
            <div className="num">{fmtCLP(totalXRendir)}</div>
            <div className="lbl">X Rendir</div>
          </div>
        )}
        <div className="stat-card warn">
          <div className="num">{fmtCLP(totalPendiente)}</div>
          <div className="lbl">{tipo === "egreso" ? "Pendiente de Pago" : "Pendiente"}</div>
        </div>
      </div>

      {tipo === "ingreso" && (
        <div style={{ marginBottom: 20 }}>
          <h3>Cierre de caja diario</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>N° Registros</th>
                  <th>Efectivo</th>
                  <th>Tarjeta</th>
                  <th>Transferencia</th>
                  <th>Pendiente</th>
                  <th>Total del día</th>
                </tr>
              </thead>
              <tbody>
                {cierreDiario.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Sin registros</div>
                    </td>
                  </tr>
                ) : (
                  cierreDiario.map((d) => (
                    <tr key={d.dia}>
                      <td>{new Date(d.dia + "T12:00:00").toLocaleDateString("es-CL")}</td>
                      <td>{d.cantidad}</td>
                      <td>{fmtCLP(d.efectivo)}</td>
                      <td>{fmtCLP(d.tarjeta)}</td>
                      <td>{fmtCLP(d.transferencia)}</td>
                      <td>{fmtCLP(d.pendiente)}</td>
                      <td>
                        <strong>{fmtCLP(d.total)}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, categoría o contraparte..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {items.length === 0 ? (
          <div className="empty">Sin registros</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.descripcion}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.categoria || "Sin categoría"} · {m.contraparte || "-"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtCLP(m.monto)} · {new Date(m.fecha).toLocaleDateString("es-CL")}
                  </div>
                </div>
                <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(m) }]} />
              </div>
              {tipo === "egreso" ? (
                <Select value={m.estado} onValueChange={(v) => v && cambiarEstadoEgreso(m, v as MovimientoContable["estado"])}>
                  <SelectTrigger size="sm" className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pagado_cc">Pagado desde CC</SelectItem>
                    <SelectItem value="pagado_efectivo">Pagado en Efectivo</SelectItem>
                    <SelectItem value="x_rendir">X Rendir</SelectItem>
                    <SelectItem value="pendiente_pago">Pendiente de Pago</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => toggleEstado(m)}>
                  {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tipo === "egreso" ? "Fecha Emisión" : "Fecha"}</TableHead>
              {tipo === "egreso" && <TableHead>Fecha Registro</TableHead>}
              {tipo === "egreso" && <TableHead>Fecha Pago</TableHead>}
              <TableHead className="max-w-[200px]">Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              {tipo === "egreso" && <TableHead>RUT</TableHead>}
              <TableHead>{CONTRAPARTE_LABEL[tipo]}</TableHead>
              {tipo === "egreso" && <TableHead>N° Factura</TableHead>}
              {tipo === "egreso" && <TableHead>Documento</TableHead>}
              {tipo === "egreso" && <TableHead>Adjunto</TableHead>}
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              {tipo !== "egreso" && <TableHead>Método</TableHead>}
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tipo === "egreso" ? 13 : 8}>
                  <div className="empty">Sin registros</div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.fecha).toLocaleDateString("es-CL")}</TableCell>
                  {tipo === "egreso" && <TableCell>{new Date(m.creadoEn).toLocaleDateString("es-CL")}</TableCell>}
                  {tipo === "egreso" && <TableCell>{m.fechaPago ? new Date(m.fechaPago).toLocaleDateString("es-CL") : "-"}</TableCell>}
                  <TableCell className="max-w-[200px] truncate" title={m.descripcion}>{m.descripcion}</TableCell>
                  <TableCell>{m.categoria || "-"}</TableCell>
                  {tipo === "egreso" && <TableCell>{m.rutProveedor ? formatRut(m.rutProveedor) : "-"}</TableCell>}
                  <TableCell>{m.contraparte || "-"}</TableCell>
                  {tipo === "egreso" && <TableCell>{m.numeroFactura || "-"}</TableCell>}
                  {tipo === "egreso" && <TableCell>{m.tipoDocumento || "-"}</TableCell>}
                  {tipo === "egreso" && (
                    <TableCell>
                      {m.documentoUrl ? (
                        <a href={m.documentoUrl} target="_blank" rel="noopener noreferrer">
                          Ver
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  )}
                  <TableCell>{fmtCLP(m.monto)}</TableCell>
                  <TableCell>
                    {tipo === "egreso" ? (
                      <span className={`status-pill ${ESTADO_EGRESO_CLASE[m.estado] || "warn"}`}>
                        {ESTADO_EGRESO_LABEL[m.estado] || m.estado}
                      </span>
                    ) : (
                      <span className={`status-pill ${m.estado === "pagado" ? "ok" : "warn"}`}>
                        {m.estado === "pagado" ? "Pagado" : "Pendiente"}
                      </span>
                    )}
                  </TableCell>
                  {tipo !== "egreso" && (
                    <TableCell>
                      {m.metodoPago === "efectivo"
                        ? "Efectivo"
                        : m.metodoPago === "tarjeta"
                          ? "Tarjeta"
                          : m.metodoPago === "transferencia"
                            ? "Transferencia bancaria"
                            : "-"}
                    </TableCell>
                  )}
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      {tipo === "egreso" ? (
                        <Select
                          value={m.estado}
                          onValueChange={(v) => v && cambiarEstadoEgreso(m, v as MovimientoContable["estado"])}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pagado_cc">Pagado desde CC</SelectItem>
                            <SelectItem value="pagado_efectivo">Pagado en Efectivo</SelectItem>
                            <SelectItem value="x_rendir">X Rendir</SelectItem>
                            <SelectItem value="pendiente_pago">Pendiente de Pago</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => toggleEstado(m)}>
                          {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(m)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
