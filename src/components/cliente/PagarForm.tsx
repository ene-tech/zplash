"use client";

import { useRef } from "react";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import VolverBoton from "@/components/cliente/VolverBoton";
import type { PreciosPublicos } from "@/components/cliente/types";
import { usePagarForm } from "@/components/cliente/pagarForm/usePagarForm";
import { PagoUnicoCard } from "@/components/cliente/pagarForm/PagoUnicoCard";
import { ResultadoBusqueda } from "@/components/cliente/pagarForm/ResultadoBusqueda";
import { fmtCLP } from "@/lib/helpers";

export default function PagarForm({ precios }: { precios: PreciosPublicos }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const r = usePagarForm();
  // lavado_unico/aspirado ya piden su propia patente arriba en PagoUnicoCard
  // (que además cobra directo, sin pasar por "Buscar"): el panel genérico de
  // abajo sería un segundo campo de patente redundante para ese flujo.
  const esPagoUnico = r.item === "lavado_unico" || r.item === "aspirado";

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <VolverBoton href="/cliente" label="Volver a Inicio" style={{ marginBottom: 0 }} />
        <CarritoBadge />
      </div>

      {r.item === "plan" && (
        <div className="card" style={{ marginBottom: 18 }}>
          <p style={{ color: "var(--gray)", fontSize: 13.5 }}>Vas a contratar:</p>
          <h3>🚗 Plan Ilimitado Mensual</h3>
        </div>
      )}

      {r.item === "lavado_unico" && (
        <PagoUnicoCard
          icono="🚿"
          titulo="Lavado Full Tunnel"
          precio={precios.lavadoUnico.precio}
          tipo="lavado_unico"
          patente={r.patente}
          setPatente={r.setPatente}
          err={r.err}
          pagando={r.pagando}
          onPagar={(tipo, datosDocumento) => r.pagar(tipo, undefined, undefined, datosDocumento)}
        />
      )}

      {r.item === "aspirado" && (
        <PagoUnicoCard
          icono="🧹"
          titulo="Uso Zona Aspirado Autoservicio"
          precio={precios.zonaAspirado.precio}
          tipo="aspirado"
          patente={r.patente}
          setPatente={r.setPatente}
          err={r.err}
          pagando={r.pagando}
          onPagar={(tipo, datosDocumento) => r.pagar(tipo, undefined, undefined, datosDocumento)}
        />
      )}

      {!esPagoUnico && (
        <>
          <div className="scan-panel">
            <h2>Pagar en ZPlash</h2>
            <p className="hint">Ingresa tu patente para renovar tu plan o pagar un servicio.</p>
            <input
              ref={inputRef}
              className="plate-input"
              value={r.patente}
              onChange={(e) => r.setPatente(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && r.buscar()}
              placeholder="AB1234"
              maxLength={6}
            />
            <div className="err">{r.err}</div>
            <button className="btn" onClick={r.buscar} disabled={r.buscando}>
              {r.buscando ? "Buscando..." : "Buscar"}
            </button>
          </div>

          <ResultadoBusqueda
            precios={precios}
            resultado={r.resultado}
            mostrarAuto={r.mostrarAuto}
            setMostrarAuto={r.setMostrarAuto}
            pagando={r.pagando}
            accionPlan={r.accionPlan}
            pasoMetodo={r.pasoMetodo}
            elegirMetodo={r.elegirMetodo}
            cancelarMetodo={r.cancelarMetodo}
            conectarGoogle={r.conectarGoogle}
            confirmarPago={r.confirmarPago}
            soloPagoUnico={r.soloPagoUnico}
            email={r.email}
            setEmail={r.setEmail}
            inscribiendo={r.inscribiendo}
            activarAutomatica={r.activarAutomatica}
          />
        </>
      )}

      {precios.servicios.length > 0 && (
        <>
          <h3 style={{ margin: "24px 0 12px" }}>Servicios puntuales</h3>
          <div className="service-grid">
            {precios.servicios.map((s) => (
              <button
                key={s.id}
                className="service-btn"
                onClick={() => r.pagar("servicio", s.id, s.id)}
                disabled={r.pagando !== null}
              >
                <div className="nombre">{s.nombre}</div>
                <div className="precio">{r.pagando === s.id ? "Redirigiendo..." : fmtCLP(s.precio)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
