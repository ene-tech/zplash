"use client";

import { useState } from "react";
import { CATEGORIA_DETAILING, fmtCLP } from "@/lib/helpers";
import { useTamanoVehiculo } from "@/hooks/useTamanoVehiculo";
import DetailingQuickView, { type DetailingServicioPreview } from "@/components/cliente/DetailingQuickView";
import { TAMANOS_VEHICULO, TAMANO_LABEL, TAMANO_DESCRIPCION } from "@/types";
import type { PreciosPublicos } from "./types";

export default function DetailingTab({ precios }: { precios: PreciosPublicos | null }) {
  const [seleccionado, setSeleccionado] = useState<DetailingServicioPreview | null>(null);
  const { tamano, elegir, limpiar } = useTamanoVehiculo();

  // La tabla `servicios` no tiene orden propio (getPreciosPublicos la lee sin
  // ORDER BY), así que el orden de categorías queda a merced de cómo haya
  // quedado la fila en la base. Lavado Completo Detailing va siempre primero
  // porque es el servicio principal de esta sección; el resto conserva el
  // orden en que aparece.
  const categorias = Array.from(new Set((precios?.servicios ?? []).map((s) => s.categoria || "Otros"))).sort((a, b) =>
    a === CATEGORIA_DETAILING ? -1 : b === CATEGORIA_DETAILING ? 1 : 0
  );

  // Solo Lavado Completo Detailing tiene precio por tamaño (ver
  // PRECIOS_TAMANO_DEFAULT); esto es lo que decide si vale la pena pedirle
  // el tamaño al cliente antes de mostrar la sección, o si se salta directo
  // a los precios (p.ej. si algún día el catálogo queda solo con
  // Adicionales de precio flat).
  const hayServicioConTamano = (precios?.servicios ?? []).some((s) => s.preciosTamano);

  return (
    <div>
      <h2 className="section-title">SERVICIOS DE LIMPIEZA PROFESIONAL Y DETAILING AUTOMOTRIZ</h2>

      {!precios ? (
        <div className="empty">Cargando servicios...</div>
      ) : hayServicioConTamano && !tamano ? (
        <div className="card">
          <h3>¿Qué tamaño tiene tu vehículo?</h3>
          <p className="desc" style={{ marginBottom: 16 }}>
            El precio del Lavado Completo Detailing varía según el tamaño de tu auto.
          </p>
          <div className="tamano-grid">
            {TAMANOS_VEHICULO.map((t) => (
              <button key={t} type="button" className="tamano-btn" onClick={() => elegir(t)}>
                <div className="letra">{TAMANO_LABEL[t]}</div>
                <div className="detalle">{TAMANO_DESCRIPCION[t]}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {hayServicioConTamano && tamano && (
            <div className="tamano-actual">
              Tamaño de vehículo: <strong>{TAMANO_LABEL[tamano]}</strong> · {TAMANO_DESCRIPCION[tamano]}
              <button type="button" onClick={limpiar}>
                Cambiar
              </button>
            </div>
          )}
          {categorias.map((cat) => (
            <div key={cat} style={{ marginBottom: 22 }}>
              <h3 style={{ marginBottom: 12 }}>{cat}</h3>
              <div className="service-grid">
                {precios.servicios
                  .filter((s) => (s.categoria || "Otros") === cat)
                  .map((s) => {
                    const precio = s.preciosTamano && tamano ? s.preciosTamano[tamano] : s.precio;
                    return (
                      <button
                        type="button"
                        className="service-btn"
                        key={s.id}
                        onClick={() => setSeleccionado({ id: s.id, nombre: s.nombre, precio })}
                      >
                        <div className="nombre">{s.nombre}</div>
                        <div className="precio">{fmtCLP(precio)}</div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="card" style={{ marginTop: 4 }}>
        <p style={{ color: "var(--gray)", fontSize: 13 }}>
          Los servicios adicionales (tapiz, alfombra, techo, motor, chasis) se pueden agregar a cualquier lavado
          completo. Consulta disponibilidad en el local o por WhatsApp.
        </p>
      </div>

      <DetailingQuickView servicio={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
