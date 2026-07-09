"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP, generarCodigoCupon } from "@/lib/helpers";
import type { Cupon, Venta } from "@/types";

function estadoCupon(c: Cupon): { label: string; cls: "ok" | "warn" | "bad" } {
  if (c.usado) return { label: "Usado", cls: "ok" };
  if (new Date(c.fechaCaducidad) < new Date()) return { label: "Caducado", cls: "bad" };
  return { label: "Disponible", cls: "warn" };
}

export default function VentaEmpresaTab() {
  const { data, commit } = useApp();
  const nombreRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const caducidadRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [hayValor, setHayValor] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [estadoTransferencia, setEstadoTransferencia] = useState<"pagado" | "pendiente" | null>(null);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const generar = async () => {
    const nombreLote = nombreRef.current?.value.trim() || "";
    const cantidad = Number(cantidadRef.current?.value || 0);
    const valorTotal = Number(valorRef.current?.value || 0);
    const fechaCaducidad = caducidadRef.current?.value || "";
    if (!nombreLote || !cantidad || cantidad < 1 || !fechaCaducidad) {
      setErr({ msg: "Completa nombre, cantidad y fecha de caducidad", ok: false });
      return;
    }
    if (cantidad > 500) {
      setErr({ msg: "Máximo 500 cupones por lote", ok: false });
      return;
    }
    if (valorTotal > 0 && tipoDoc === "Factura") {
      const razonSocial = razonSocialRef.current?.value.trim();
      const rut = rutRef.current?.value.trim();
      if (!razonSocial || !rut) {
        setErr({ msg: "Completa Razón Social y RUT para la factura", ok: false });
        return;
      }
    }
    if (valorTotal > 0 && !metodoPago) {
      setErr({ msg: "Selecciona la forma de pago", ok: false });
      return;
    }
    if (valorTotal > 0 && metodoPago === "transferencia" && !estadoTransferencia) {
      setErr({ msg: "Indica si la transferencia está pagada o por pagar", ok: false });
      return;
    }

    const valorPorCupon = Math.round(valorTotal / cantidad);
    const existentes = new Set(data.cupones.map((c) => c.codigo));
    const nuevos: Cupon[] = [];
    for (let i = 0; i < cantidad; i++) {
      const codigo = generarCodigoCupon(existentes);
      existentes.add(codigo);
      nuevos.push({
        id: "cup" + Date.now() + i + Math.floor(Math.random() * 1000),
        codigo,
        nombreLote,
        valor: valorPorCupon,
        numeroLote: i + 1,
        totalLote: cantidad,
        fechaCaducidad: new Date(fechaCaducidad + "T23:59:59").toISOString(),
        usado: false,
        creadoEn: new Date().toISOString(),
        creadoPor: "Administrador",
      });
    }

    let ventas = data.ventas;
    if (valorTotal > 0) {
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: "",
        patente: "",
        nombre: `Venta Empresa · ${nombreLote}`,
        plan: "",
        precio: valorTotal,
        tipo: "Cupón Venta Empresa",
        fecha: new Date().toISOString(),
        operador: "Administrador",
        tipoDocumento: tipoDoc,
        razonSocial: tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "",
        rut: tipoDoc === "Factura" ? rutRef.current?.value.trim() || "" : "",
        direccion: tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "",
        giro: tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "",
        metodoPago: metodoPago || undefined,
        estadoPago: metodoPago === "transferencia" ? estadoTransferencia || undefined : "pagado",
      };
      ventas = [venta, ...ventas];
    }

    const ok = await commit({ cupones: [...nuevos, ...data.cupones], ventas });
    if (!ok) {
      setErr({ msg: "No se pudieron generar los cupones (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({
      msg:
        `${cantidad} cupones generados para "${nombreLote}"` +
        (valorTotal > 0 ? ` — se registró ${fmtCLP(valorTotal)} en el cierre de caja de hoy` : ""),
      ok: true,
    });
    if (nombreRef.current) nombreRef.current.value = "";
    if (cantidadRef.current) cantidadRef.current.value = "";
    if (valorRef.current) valorRef.current.value = "";
    if (caducidadRef.current) caducidadRef.current.value = "";
    if (razonSocialRef.current) razonSocialRef.current.value = "";
    if (rutRef.current) rutRef.current.value = "";
    if (direccionRef.current) direccionRef.current.value = "";
    if (giroRef.current) giroRef.current.value = "";
    setTipoDoc("Boleta");
    setHayValor(false);
    setMetodoPago(null);
    setEstadoTransferencia(null);
  };

  const eliminar = (cup: Cupon) => {
    commit({ cupones: data.cupones.filter((x) => x.id !== cup.id) });
  };

  const q = busqueda.toLowerCase().trim();
  const filtrados = data.cupones
    .filter((c) => !q || c.nombreLote.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

  const descargar = () => {
    import("xlsx").then((XLSX) => {
      const filas = filtrados.map((c) => {
        const est = estadoCupon(c);
        return {
          Código: c.codigo,
          "N°": `${c.numeroLote}/${c.totalLote}`,
          Lote: c.nombreLote,
          "Valor c/u": c.valor > 0 ? c.valor : "Gratis",
          Caducidad: new Date(c.fechaCaducidad).toLocaleDateString("es-CL"),
          Estado: est.label,
          "Patente de uso": c.patenteUso || "",
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          filas.length
            ? filas
            : [{ Código: "", "N°": "", Lote: "", "Valor c/u": "", Caducidad: "", Estado: "", "Patente de uso": "" }]
        ),
        "Cupones"
      );
      XLSX.writeFile(wb, "cupones-venta-empresa.xlsx");
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 480, margin: "0 0 24px 0" }}>
        <h3>Generar cupones</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Genera cupones de ingreso para vender a empresas. El valor se registra completo en el cierre de caja de
          hoy (la empresa paga el lote entero por adelantado); cada cupón se canjea después una sola vez desde el
          perfil operador, ingresando el código y la patente del vehículo que lo usa.
        </div>
        <div className="field">
          <label>Nombre (empresa / lote)</label>
          <input ref={nombreRef} placeholder="Ej: Empresa ABC" />
        </div>
        <div className="field">
          <label>Cantidad de cupones</label>
          <input ref={cantidadRef} type="number" min={1} placeholder="10" />
        </div>
        <div className="field">
          <label>Valor total del lote (0 = gratis)</label>
          <input
            ref={valorRef}
            type="number"
            min={0}
            placeholder="0"
            onChange={(e) => setHayValor(Number(e.target.value) > 0)}
          />
        </div>
        <div className="field">
          <label>Fecha de caducidad</label>
          <input ref={caducidadRef} type="date" />
        </div>
        <div className="field">
          <label>Tipo de documento</label>
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as "Boleta" | "Factura")}>
            <option value="Boleta">Boleta</option>
            <option value="Factura">Factura</option>
          </select>
        </div>
        {tipoDoc === "Factura" && (
          <div>
            <div className="field">
              <label>Razón Social</label>
              <input ref={razonSocialRef} />
            </div>
            <div className="field">
              <label>RUT</label>
              <input ref={rutRef} placeholder="12.345.678-9" />
            </div>
            <div className="field">
              <label>Dirección</label>
              <input ref={direccionRef} />
            </div>
            <div className="field">
              <label>Giro</label>
              <input ref={giroRef} />
            </div>
          </div>
        )}
        {hayValor && (
          <div className="field">
            <label>Forma de pago</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={metodoPago === "efectivo" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => {
                  setMetodoPago("efectivo");
                  setEstadoTransferencia(null);
                }}
              >
                Efectivo
              </button>
              <button
                type="button"
                className={metodoPago === "tarjeta" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => {
                  setMetodoPago("tarjeta");
                  setEstadoTransferencia(null);
                }}
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
            {metodoPago === "transferencia" && (
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className={`estado-pago-btn ok${estadoTransferencia === "pagado" ? " selected" : ""}`}
                  onClick={() => setEstadoTransferencia("pagado")}
                >
                  Pagada
                </button>
                <button
                  type="button"
                  className={`estado-pago-btn bad${estadoTransferencia === "pendiente" ? " selected" : ""}`}
                  onClick={() => setEstadoTransferencia("pendiente")}
                >
                  Por pagar
                </button>
              </div>
            )}
          </div>
        )}
        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={generar}>
          Generar cupones
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button className="btn ghost" onClick={descargar}>
          Descargar (Excel)
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>N°</th>
              <th>Lote</th>
              <th>Valor c/u</th>
              <th>Caducidad</th>
              <th>Estado</th>
              <th>Patente uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Sin cupones</div>
                </td>
              </tr>
            ) : (
              filtrados.map((c) => {
                const est = estadoCupon(c);
                return (
                  <tr key={c.id}>
                    <td className="plate-tag">{c.codigo}</td>
                    <td>
                      {c.numeroLote}/{c.totalLote}
                    </td>
                    <td>{c.nombreLote}</td>
                    <td>{c.valor > 0 ? fmtCLP(c.valor) : "Gratis"}</td>
                    <td>{new Date(c.fechaCaducidad).toLocaleDateString("es-CL")}</td>
                    <td>
                      <span className={`status-pill ${est.cls}`}>{est.label}</span>
                    </td>
                    <td>{c.patenteUso || "-"}</td>
                    <td className="row-actions">
                      {!c.usado && (
                        <button className="icon-btn" onClick={() => eliminar(c)}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
