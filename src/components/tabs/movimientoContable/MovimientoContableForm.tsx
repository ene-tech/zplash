"use client";

import type { RefObject } from "react";
import { Buscador } from "@/components/Buscador";
import PriceInput from "@/components/PriceInput";
import { CANAL_INGRESO_OTROS, formatRut, todayYMD } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";
import { CONTRAPARTE_LABEL, type useMovimientoContableForm } from "./useMovimientoContableForm";

type Props = ReturnType<typeof useMovimientoContableForm> & {
  tipo: MovimientoContable["tipo"];
  titulo: string;
  fechaRef: RefObject<HTMLInputElement | null>;
  descripcionRef: RefObject<HTMLInputElement | null>;
  contraparteRef: RefObject<HTMLInputElement | null>;
  rutProveedorRef: RefObject<HTMLInputElement | null>;
  numeroFacturaRef: RefObject<HTMLInputElement | null>;
  notasRef: RefObject<HTMLTextAreaElement | null>;
  archivoInputRef: RefObject<HTMLInputElement | null>;
};

// Formulario de alta de un Movimiento Contable: sus campos cambian según
// `tipo` (ingreso vs egreso) pero comparten Monto, Estado y Notas.
// Los refs se desestructuran directo de los parámetros (no se leen como
// `p.xxxRef`): si quedan como propiedad de un objeto que también se usa para
// leer valores normales durante el render, el linter de React Compiler
// marca esas lecturas como "acceso a ref" (ver mismo ajuste en
// useOperadorFoundResult).
export default function MovimientoContableForm({
  tipo,
  fechaRef,
  descripcionRef,
  contraparteRef,
  rutProveedorRef,
  numeroFacturaRef,
  notasRef,
  archivoInputRef,
  ...p
}: Props) {
  return (
    <div className="modal" style={{ maxWidth: 520, margin: "0 0 24px 0" }}>
      <h3>Registrar {p.titulo.toLowerCase()}</h3>
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
            value={p.categoriaGasto}
            onChange={p.setCategoriaGasto}
            opciones={p.glosasGasto}
            placeholder="Escribe para buscar un tipo de gasto..."
          />
        ) : (
          <>
            <select value={p.categoriaIngreso} onChange={(e) => p.onCategoriaIngresoChange(e.target.value)}>
              <option value="">Selecciona una categoría...</option>
              {p.canalesIngreso.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {p.categoriaIngreso === CANAL_INGRESO_OTROS && (
              <textarea
                value={p.comentarioOtros}
                onChange={(e) => p.setComentarioOtros(e.target.value)}
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
              className={p.tipoDocumento === "Boleta" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => p.setTipoDocumento("Boleta")}
            >
              Boleta
            </button>
            <button
              type="button"
              className={p.tipoDocumento === "Factura" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => p.setTipoDocumento("Factura")}
            >
              Factura
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <label>{tipo === "egreso" ? "Monto Total (IVA Incl.)" : "Monto"}</label>
        <PriceInput value={p.montoTexto} onChange={p.setMontoTexto} />
      </div>
      {tipo === "egreso" && (
        <div className="field">
          <label>Adjuntar documento</label>
          <input ref={archivoInputRef} type="file" accept="image/*,.pdf" onChange={(e) => p.setArchivo(e.target.files?.[0] || null)} />
        </div>
      )}
      <div className="field">
        <label>Estado</label>
        <div style={{ display: "flex", gap: 10 }}>
          {tipo === "egreso" ? (
            <>
              <button
                type="button"
                className={p.estado === "pagado_cc" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => p.setEstado("pagado_cc")}
              >
                Pagado desde CC
              </button>
              <button
                type="button"
                className={p.estado === "pagado_efectivo" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => p.setEstado("pagado_efectivo")}
              >
                Efectivo
              </button>
              <button
                type="button"
                className={p.estado === "x_rendir" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => p.setEstado("x_rendir")}
              >
                X Rendir
              </button>
              <button
                type="button"
                className={p.estado === "pendiente_pago" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => p.setEstado("pendiente_pago")}
              >
                Pendiente de Pago
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={p.estado === "pagado" ? "btn" : "btn ghost"}
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => p.setEstado("pagado")}
              >
                Pagado
              </button>
              {!p.estadoBloqueadoPagado && (
                <button
                  type="button"
                  className={p.estado === "pendiente" ? "btn" : "btn ghost"}
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => {
                    p.setEstado("pendiente");
                    p.setMetodoPago(null);
                  }}
                >
                  Pendiente
                </button>
              )}
            </>
          )}
        </div>
        {p.estadoBloqueadoPagado && (
          <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 6 }}>
            Los ingresos de Servicios de Lavado / Túnel se registran siempre como Pagado.
          </div>
        )}
      </div>
      {tipo === "ingreso" && p.estado === "pagado" && (
        <div className="field">
          <label>Método de pago</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={p.metodoPago === "efectivo" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => p.setMetodoPago("efectivo")}
            >
              Efectivo
            </button>
            <button
              type="button"
              className={p.metodoPago === "tarjeta" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => p.setMetodoPago("tarjeta")}
            >
              Tarjeta
            </button>
            <button
              type="button"
              className={p.metodoPago === "transferencia" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => p.setMetodoPago("transferencia")}
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
      <div className="err" style={{ color: p.err?.ok ? "var(--green)" : undefined }}>
        {p.err?.msg || ""}
      </div>
      <button className="btn" onClick={p.agregar} disabled={p.subiendo}>
        {p.subiendo ? "Subiendo documento..." : "Registrar"}
      </button>
    </div>
  );
}
