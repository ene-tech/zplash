"use client";

import type { RefObject } from "react";
import DatosTransferencia from "@/components/DatosTransferencia";
import PriceInput from "@/components/PriceInput";
import type { useGenerarCupones } from "./useGenerarCupones";

type Props = ReturnType<typeof useGenerarCupones> & {
  nombreRef: RefObject<HTMLInputElement | null>;
  cantidadRef: RefObject<HTMLInputElement | null>;
  caducidadRef: RefObject<HTMLInputElement | null>;
  razonSocialRef: RefObject<HTMLInputElement | null>;
  rutRef: RefObject<HTMLInputElement | null>;
  direccionRef: RefObject<HTMLInputElement | null>;
  giroRef: RefObject<HTMLInputElement | null>;
};

// Formulario "Generar cupones" (vale de entrada para vender a una empresa,
// en lote). Los refs se desestructuran directo de los parámetros — ver nota
// en MovimientoContableForm sobre por qué no viajan como `p.xxxRef`.
export default function GenerarCuponesForm({
  nombreRef,
  cantidadRef,
  caducidadRef,
  razonSocialRef,
  rutRef,
  direccionRef,
  giroRef,
  ...p
}: Props) {
  return (
    <div className="modal" style={{ maxWidth: 480, flex: "1 1 400px", margin: 0 }}>
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
        <PriceInput
          value={p.valorTexto}
          onChange={(v) => {
            p.setValorTexto(v);
            p.setHayValor(Number(v) > 0);
          }}
        />
      </div>
      <div className="field">
        <label>¿Para qué patentes son los cupones?</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={p.patentesAbierto ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => p.setPatentesAbierto(true)}
          >
            Dejar abierto (cualquier patente)
          </button>
          <button
            type="button"
            className={!p.patentesAbierto ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => p.setPatentesAbierto(false)}
          >
            Ingresar patentes autorizadas
          </button>
        </div>
      </div>
      {!p.patentesAbierto && (
        <div className="field">
          <label>Patentes (una por línea o separadas por coma)</label>
          <textarea
            value={p.patentesTexto}
            onChange={(e) => p.setPatentesTexto(e.target.value)}
            placeholder={"AB1234\nCD5678"}
            rows={3}
            style={{ textTransform: "uppercase" }}
          />
        </div>
      )}
      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={p.unCuponPorPatente}
            onChange={(e) => p.setUnCuponPorPatente(e.target.checked)}
            style={{ width: "auto" }}
          />
          Un cupón por patente
        </label>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 4 }}>
          Cada patente puede canjear un solo cupón del lote. Útil en packs de cortesía o de un evento
          publicitario, para que la promoción llegue a clientes distintos y no la use entera un mismo auto.
        </div>
      </div>
      <div className="field">
        <label>Fecha de caducidad</label>
        <input ref={caducidadRef} type="date" />
      </div>
      <div className="field">
        <label>Tipo de documento</label>
        <select value={p.tipoDoc} onChange={(e) => p.setTipoDoc(e.target.value as "Boleta" | "Factura")}>
          <option value="Boleta">Boleta</option>
          <option value="Factura">Factura</option>
        </select>
      </div>
      {p.tipoDoc === "Factura" && (
        <div>
          <div className="field">
            <label>RUT</label>
            <input ref={rutRef} placeholder="12.345.678-9" onBlur={p.onRutBlur} />
          </div>
          <div className="field">
            <label>Razón Social</label>
            <input ref={razonSocialRef} />
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
      {p.hayValor && (
        <div className="field">
          <label>Forma de pago</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={p.metodoPago === "efectivo" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => {
                p.setMetodoPago("efectivo");
                p.setEstadoTransferencia(null);
              }}
            >
              Efectivo
            </button>
            <button
              type="button"
              className={p.metodoPago === "tarjeta" ? "btn" : "btn ghost"}
              style={{ flex: 1, marginTop: 0 }}
              onClick={() => {
                p.setMetodoPago("tarjeta");
                p.setEstadoTransferencia(null);
              }}
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
          {p.metodoPago === "transferencia" && (
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className={`estado-pago-btn ok${p.estadoTransferencia === "pagado" ? " selected" : ""}`}
                onClick={() => p.setEstadoTransferencia("pagado")}
              >
                Pagada
              </button>
              <button
                type="button"
                className={`estado-pago-btn bad${p.estadoTransferencia === "pendiente" ? " selected" : ""}`}
                onClick={() => p.setEstadoTransferencia("pendiente")}
              >
                Por pagar
              </button>
            </div>
          )}
          {p.metodoPago === "transferencia" && <DatosTransferencia />}
        </div>
      )}
      <div className="err" style={{ color: p.err?.ok ? "var(--green)" : undefined }}>
        {p.err?.msg || ""}
      </div>
      <button className="btn" onClick={p.generar}>
        Generar cupones
      </button>
    </div>
  );
}
