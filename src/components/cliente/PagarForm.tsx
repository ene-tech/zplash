"use client";

import { useRef } from "react";
import Link from "next/link";
import CarritoBadge from "@/components/cliente/CarritoBadge";
import VolverBoton from "@/components/cliente/VolverBoton";
import type { PreciosPublicos } from "@/components/cliente/types";
import { usePagarForm } from "@/components/cliente/pagarForm/usePagarForm";
import { PagoUnicoCard } from "@/components/cliente/pagarForm/PagoUnicoCard";
import { ResultadoBusqueda } from "@/components/cliente/pagarForm/ResultadoBusqueda";
import { ServicioDocumentoCard } from "@/components/cliente/pagarForm/ServicioDocumentoCard";
import { fmtCLP, normPlate } from "@/lib/helpers";

export default function PagarForm({ precios }: { precios: PreciosPublicos }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const r = usePagarForm();
  const promo = precios.promo2Lavados;
  // Promo 2 Lavados (ver PROMO_2_LAVADOS_KEY): precio 0 = apagada, y un link
  // viejo con ?item=promo_2_lavados cae al panel genérico de abajo.
  const hayPromo = promo.precio > 0;
  // lavado_unico/aspirado/promo ya piden su propia patente arriba en
  // PagoUnicoCard (que además cobra directo, sin pasar por "Buscar"): el panel
  // genérico de abajo sería un segundo campo de patente redundante para ese flujo.
  const esPagoUnico = r.item === "lavado_unico" || r.item === "aspirado" || (r.item === "promo_2_lavados" && hayPromo);
  // La promo se ofrece a quien no tiene plan al día (vencido o sin plan, los
  // dos son "bad" en planStatus) o a la patente que no está registrada: al
  // cliente con plan vigente no le sirve.
  const ofrecerPromo = hayPromo && !!r.resultado && (!r.resultado.encontrado || r.resultado.estado?.cls === "bad");
  const nombrePromo = `Promo ${promo.lavados} Lavados Full Tunnel`;

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <VolverBoton href="/cliente" label="Volver a Inicio" style={{ marginBottom: 0 }} />
        <CarritoBadge />
      </div>

      {r.item === "plan" && (
        <div className="card" style={{ marginBottom: 18 }}>
          <p style={{ color: "var(--gray)", fontSize: 13.5 }}>Vas a contratar:</p>
          <h3>🚗 Plan X5</h3>
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

      {r.item === "promo_2_lavados" && hayPromo && (
        <PagoUnicoCard
          icono="🎟️"
          titulo={`${nombrePromo} · para un auto, ${promo.vigenciaDias} días`}
          precio={promo.precio}
          tipo="promo_2_lavados"
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
            email={r.email}
            setEmail={r.setEmail}
            inscribiendo={r.inscribiendo}
            activarAutomatica={r.activarAutomatica}
          />

          {ofrecerPromo && (
            <div className="card" style={{ marginTop: 16 }}>
              <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 6 }}>Promoción</p>
              <h3 style={{ marginBottom: 6 }}>
                🎟️ {promo.lavados} lavados Full Tunnel por {fmtCLP(promo.precio)}
              </h3>
              <p style={{ color: "var(--gray)", fontSize: 13.5, marginBottom: 12 }}>
                Para la patente <span className="plate-tag">{normPlate(r.patente)}</span>, a usar dentro de {promo.vigenciaDias}{" "}
                días. Quedan como tickets en tu cuenta: en el local basta con dar la patente.
              </p>
              {/* Un solo camino de compra: el mismo PagoUnicoCard de arriba
                  (?item=), con la patente ya buscada. `item` sale de
                  useSearchParams, así que el cambio de query lo muestra sin
                  recargar. */}
              <Link
                href={`/pagar?item=promo_2_lavados&patente=${encodeURIComponent(normPlate(r.patente))}`}
                className="btn"
                style={{ marginTop: 0, textDecoration: "none" }}
              >
                Comprar la promo
              </Link>
            </div>
          )}
        </>
      )}

      {precios.servicios.length > 0 && (
        <>
          <h3 style={{ margin: "24px 0 12px" }}>Servicios puntuales</h3>
          <div className="service-grid">
            {precios.servicios.map((s) => (
              <button
                key={s.id}
                className={`service-btn ${r.accionServicio?.id === s.id ? "selected" : ""}`}
                onClick={() => r.elegirServicio(s.id, s.nombre, s.precio)}
                disabled={r.pagando !== null || r.accionServicio !== null}
              >
                <div className="nombre">{s.nombre}</div>
                <div className="precio">{r.pagando === s.id ? "Redirigiendo..." : fmtCLP(s.precio)}</div>
              </button>
            ))}
          </div>
          {r.accionServicio && (
            <ServicioDocumentoCard
              accionServicio={r.accionServicio}
              pagando={r.pagando}
              err={r.err}
              onCancelar={r.cancelarServicio}
              onConfirmar={r.confirmarServicio}
            />
          )}
        </>
      )}
    </div>
  );
}
