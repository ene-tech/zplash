"use client";

import { useState } from "react";
import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import DetailingQuickView, { type DetailingServicioPreview } from "@/components/cliente/DetailingQuickView";
import { TAMANO_LABEL, TAMANO_DESCRIPCION, TAMANO_EJEMPLOS, type TamanoVehiculo } from "@/types";
import type { PreciosPublicos } from "./types";

// Tamaños agrupados de a dos en la tarjeta de precios (25-nov-2026): S/M y L/XL
const GRUPOS_TAMANO: TamanoVehiculo[][] = [
  ["s", "m"],
  ["l", "xl"],
];

export default function DetailingTab({ precios }: { precios: PreciosPublicos | null }) {
  const [seleccionado, setSeleccionado] = useState<DetailingServicioPreview | null>(null);

  // La tabla `servicios` no tiene orden propio (getPreciosPublicos la lee sin
  // ORDER BY), así que el orden de categorías queda a merced de cómo haya
  // quedado la fila en la base. Lavado Completo Detailing va siempre primero
  // porque es el servicio principal de esta sección; el resto conserva el
  // orden en que aparece.
  const categorias = Array.from(new Set((precios?.servicios ?? []).map((s) => s.categoria || "Otros"))).sort((a, b) =>
    a === CATEGORIA_DETAILING ? -1 : b === CATEGORIA_DETAILING ? 1 : 0
  );

  return (
    <div>
      <h2 className="section-title">Lavado de chasis</h2>

      {!precios ? (
        <div className="empty">Cargando servicios...</div>
      ) : (
        categorias.map((cat) => {
          const servicios = precios.servicios.filter((s) => (s.categoria || "Otros") === cat);
          // Desde 25-nov-2026 los precios por tamaño se muestran todos de una,
          // sin pedir antes el tamaño del vehículo (pedido del dueño).
          const porTamano = servicios.filter((s) => s.preciosTamano);
          const planos = servicios.filter((s) => !s.preciosTamano);
          return (
            <div key={cat} style={{ marginBottom: 22 }}>
              {/* Con una sola categoría (hoy solo queda el chasis) el título de
                  la sección ya la nombra; repetirla debajo sobra. */}
              {categorias.length > 1 && <h3 style={{ marginBottom: 12 }}>{cat}</h3>}
              {porTamano.map((s) => (
                <div key={s.id} className="card" style={{ marginBottom: 12 }}>
                  <h3 className="tamano-titulo">{s.nombre}: precio según el tamaño de tu vehículo</h3>
                  <div className="tamano-grid">
                    {GRUPOS_TAMANO.map((grupo) => {
                      // Un tamaño sin precio cargado no cuenta; si el par no tiene ninguno, no se muestra
                      const precios = grupo.map((t) => s.preciosTamano![t]).filter((p) => typeof p === "number" && p > 0);
                      if (precios.length === 0) return null;
                      const precio = Math.min(...precios);
                      const label = grupo.map((t) => TAMANO_LABEL[t]).join(" / ");
                      return (
                        <button
                          key={label}
                          type="button"
                          className="tamano-btn"
                          onClick={() => setSeleccionado({ id: s.id, nombre: `${s.nombre} · Tamaño ${label}`, precio })}
                        >
                          <div className="letra">{label}</div>
                          {/* Si algún día S y M (o L y XL) no cuestan lo mismo, se muestra el menor como "desde" */}
                          <div className="precio">
                            {precios.every((p) => p === precio) ? "" : "Desde "}
                            {fmtCLP(precio)}
                          </div>
                          {grupo.map((t) => (
                            <div key={t} style={{ marginBottom: 6 }}>
                              <div className="detalle">{TAMANO_DESCRIPCION[t]}</div>
                              <div className="ejemplos">{TAMANO_EJEMPLOS[t]}</div>
                            </div>
                          ))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {planos.length > 0 && (
                <div className="service-grid servicios-chasis">
                  {planos.map((s) => (
                    <button
                      type="button"
                      className="service-btn"
                      key={s.id}
                      onClick={() => setSeleccionado({ id: s.id, nombre: s.nombre, precio: s.precio })}
                    >
                      <div className="nombre">{s.nombre}</div>
                      <div className="precio">{fmtCLP(s.precio)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <DetailingQuickView servicio={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
