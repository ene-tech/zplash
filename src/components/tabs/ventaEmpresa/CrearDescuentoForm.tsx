"use client";

import type { RefObject } from "react";
import PriceInput from "@/components/PriceInput";
import type { useCrearDescuento } from "./useCrearDescuento";

type Props = ReturnType<typeof useCrearDescuento> & {
  dNombreRef: RefObject<HTMLInputElement | null>;
  dCaducidadRef: RefObject<HTMLInputElement | null>;
  dPatenteRef: RefObject<HTMLInputElement | null>;
};

export default function CrearDescuentoForm({ dNombreRef, dCaducidadRef, dPatenteRef, ...p }: Props) {
  return (
    <div className="modal" style={{ maxWidth: 480, flex: "1 1 400px", margin: 0 }}>
      <h3>Crear descuento</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Genera un código de descuento (no un lavado gratis): resta un % o un monto fijo del precio a cobrar al
        canjearlo desde el perfil operador. Puede quedar asignado a una patente específica o abierto para
        cualquiera.
      </div>
      <div className="field">
        <label>Nombre (motivo del descuento)</label>
        <input ref={dNombreRef} placeholder="Ej: Promo redes sociales" />
      </div>
      <div className="field">
        <label>Tipo de valor</label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className={p.dTipoValor === "monto" ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => p.setDTipoValor("monto")}
          >
            Monto ($)
          </button>
          <button
            type="button"
            className={p.dTipoValor === "porcentaje" ? "btn" : "btn ghost"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => p.setDTipoValor("porcentaje")}
          >
            Porcentaje (%)
          </button>
        </div>
      </div>
      <div className="field">
        <label>{p.dTipoValor === "porcentaje" ? "Porcentaje de descuento" : "Monto a descontar"}</label>
        {p.dTipoValor === "porcentaje" ? (
          <input type="number" min={0} max={100} placeholder="15" value={p.dValorTexto} onChange={(e) => p.setDValorTexto(e.target.value)} />
        ) : (
          <PriceInput value={p.dValorTexto} onChange={p.setDValorTexto} />
        )}
      </div>
      <div className="field">
        <label>Fecha de caducidad</label>
        <input ref={dCaducidadRef} type="date" />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={p.dAbierto} onChange={(e) => p.setDAbierto(e.target.checked)} /> Abierto
          (cualquier patente)
        </label>
      </div>
      {!p.dAbierto && (
        <div className="field">
          <label>Patente</label>
          <input ref={dPatenteRef} placeholder="AB1234" style={{ textTransform: "uppercase" }} />
        </div>
      )}
      <div className="field">
        <label>
          <input type="checkbox" checked={p.dSoloNuevos} onChange={(e) => p.setDSoloNuevos(e.target.checked)} /> Solo
          clientes nuevos
        </label>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12 }}>
          Solo lo puede usar una patente que todavía no tiene ficha en ZPlash.
        </div>
      </div>
      {/* Un código asignado a UNA patente ya es de un solo uso: la regla solo
          cambia algo en uno abierto, así que ahí se ofrece. */}
      {p.dAbierto && (
        <div className="field">
          <label>
            <input type="checkbox" checked={p.dUnUsoPorPatente} onChange={(e) => p.setDUnUsoPorPatente(e.target.checked)} />{" "}
            Un uso por patente
          </label>
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12 }}>
            El código no muere en el primer canje: sirve hasta la fecha de caducidad y cada patente lo usa una sola vez.
            Para promos que circulan públicas (redes sociales, volantes).
          </div>
        </div>
      )}
      <div className="err" style={{ color: p.errDescuento?.ok ? "var(--green)" : undefined }}>
        {p.errDescuento?.msg || ""}
      </div>
      <button className="btn" onClick={p.crearDescuento}>
        Crear descuento
      </button>
    </div>
  );
}
