"use client";

import type { RefObject } from "react";
import { fmtCLP, precioServicio } from "@/lib/helpers";
import type { Precios } from "@/types";
import PriceInput from "@/components/PriceInput";
import { AJUSTES, CATEGORIA_ADICIONALES } from "./useServiciosAdicionalesForm";
import { CATEGORIA_DETAILING } from "@/lib/helpers";
import type { useServicioSeleccion } from "./useServicioSeleccion";

type Props = ReturnType<typeof useServicioSeleccion> & {
  precios: Precios;
  detallePersonalizadoRef: RefObject<HTMLInputElement | null>;
};

// Catálogo de servicios agrupado por categoría (grilla de botones toggle),
// el ajuste de tamaño para Detailing, y el sub-formulario de ítems
// personalizados (monto libre + detalle de texto) dentro de "Adicionales".
export default function ServicioCatalogoSelector(props: Props) {
  const { categorias, catalogo, serviciosSeleccionados, toggleServicio, hayDetailingSeleccionado, ajuste, setAjuste } = props;

  return (
    <>
      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
            {cat}
          </div>
          <div className="service-grid">
            {catalogo
              .filter((s) => s.categoria === cat)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`service-btn${serviciosSeleccionados.includes(s.id) ? " selected" : ""}`}
                  onClick={() => toggleServicio(s.id, s.categoria || "")}
                >
                  <div className="nombre">{s.nombre}</div>
                  <div className="precio">{fmtCLP(precioServicio(props.precios, s.id))}</div>
                </button>
              ))}
          </div>
          {cat === CATEGORIA_DETAILING && hayDetailingSeleccionado && (
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {AJUSTES.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={ajuste === a ? "btn" : "btn ghost"}
                  style={{ marginTop: 0 }}
                  onClick={() => setAjuste(ajuste === a ? 0 : a)}
                >
                  + {fmtCLP(a)}
                </button>
              ))}
            </div>
          )}
          {cat === CATEGORIA_ADICIONALES && (
            <div style={{ marginTop: 14 }}>
              <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
                Monto adicional escrito
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={props.detallePersonalizadoRef}
                  placeholder="Ej: Limpieza solo 1 butaca copiloto"
                  style={{
                    flex: "2 1 220px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--white)",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
                <PriceInput
                  value={props.montoPersonalizadoTexto}
                  onChange={props.setMontoPersonalizadoTexto}
                  placeholder="Monto"
                  style={{
                    flex: "1 1 120px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--white)",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
                <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={props.agregarPersonalizado}>
                  Agregar
                </button>
              </div>
              {props.itemsPersonalizados.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {props.itemsPersonalizados.map((i) => (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                      <span>
                        {i.nombre} — {fmtCLP(i.precio)}
                      </span>
                      <button type="button" className="icon-btn" onClick={() => props.quitarPersonalizado(i.id)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
