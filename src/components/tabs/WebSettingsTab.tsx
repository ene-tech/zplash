"use client";

import { useState } from "react";
import PriceInput from "@/components/PriceInput";
import { useApp } from "@/context/AppContext";
import {
  CANTIDAD_MINIMA_TICKETS,
  CATEGORIA_DETAILING,
  fmtCLP,
  PLANES,
  PLAN_ONECLICK_KEY,
  precioNormal,
  precioPlanOneclick,
  precioServicio,
  precioTickets,
  TICKETS_KEY,
} from "@/lib/helpers";
import { TAMANOS_VEHICULO, TAMANO_LABEL, type TamanoVehiculo } from "@/types";

const TAMANO_VACIO: Record<TamanoVehiculo, number> = { s: 0, m: 0, l: 0, xl: 0 };

export default function WebSettingsTab() {
  const { data, commit } = useApp();
  const [pagoUnicoVal, setPagoUnicoVal] = useState(() => String(precioNormal(data.precios, PLANES[0])));
  const [renovacionAutoVal, setRenovacionAutoVal] = useState(() => String(precioPlanOneclick(data.precios)));
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const [precioTicketsVal, setPrecioTicketsVal] = useState(() =>
    String(precioTickets(data.precios, CANTIDAD_MINIMA_TICKETS))
  );
  const [vigenciaVal, setVigenciaVal] = useState(() => String(data.config.vigenciaDiasPackEmpresa));
  const [msgEmpresa, setMsgEmpresa] = useState<{ texto: string; ok: boolean } | null>(null);

  const serviciosDetailing = data.servicios.filter((s) => s.categoria === CATEGORIA_DETAILING);
  const [detailingVal, setDetailingVal] = useState<Record<string, Record<TamanoVehiculo, string>>>(() =>
    Object.fromEntries(
      serviciosDetailing.map((s) => {
        const guardado = data.preciosTamano[s.id] ?? TAMANO_VACIO;
        return [s.id, { s: String(guardado.s), m: String(guardado.m), l: String(guardado.l), xl: String(guardado.xl) }];
      })
    )
  );
  const [msgDetailing, setMsgDetailing] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const precios = { ...data.precios };
    precios[PLANES[0]] = { ...precios[PLANES[0]], normal: Number(pagoUnicoVal) || 0 };
    precios[PLAN_ONECLICK_KEY] = { normal: Number(renovacionAutoVal) || 0, promo: 0 };
    const ok = await commit({ precios });
    setMsg({ texto: ok ? "Precios actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const guardarEmpresa = async () => {
    const precios = { ...data.precios };
    precios[TICKETS_KEY] = { normal: Number(precioTicketsVal) || 0, promo: 0 };
    const vigenciaDiasPackEmpresa = Math.max(1, Number(vigenciaVal) || 0);
    const ok = await commit({ precios, config: { ...data.config, vigenciaDiasPackEmpresa } });
    setMsgEmpresa({
      texto: ok ? "Pack de tickets actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.",
      ok,
    });
  };

  const guardarDetailing = async () => {
    const preciosTamano = { ...data.preciosTamano };
    for (const s of serviciosDetailing) {
      preciosTamano[s.id] = {
        s: Number(detailingVal[s.id]?.s) || 0,
        m: Number(detailingVal[s.id]?.m) || 0,
        l: Number(detailingVal[s.id]?.l) || 0,
        xl: Number(detailingVal[s.id]?.xl) || 0,
      };
    }
    const ok = await commit({ preciosTamano });
    setMsgDetailing({
      texto: ok ? "Precios de Detailing actualizados correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.",
      ok,
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 420, margin: "0 0 20px 0" }}>
        <h3>Precios de contratación web ({PLANES[0]})</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Precios que ve el cliente al contratar o renovar su plan desde la web (/pagar), por cualquier conducto.
        </div>

        <div className="field">
          <label>Pago único — cualquier tarjeta, sin renovación automática</label>
          <PriceInput value={pagoUnicoVal} onChange={setPagoUnicoVal} />
        </div>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5, marginBottom: 14 }}>
          Es el mismo precio normal que usa el mostrador para contratos presenciales — cambiarlo acá lo cambia en
          ambos lugares.
        </div>

        <div className="field">
          <label>Renovación automática — solo tarjetas de crédito (Oneclick)</label>
          <PriceInput value={renovacionAutoVal} onChange={setRenovacionAutoVal} />
        </div>

        <div className="err" style={{ color: msg?.ok ? "var(--green)" : undefined }}>{msg?.texto || ""}</div>
        <button className="btn" onClick={guardar}>
          Guardar precios
        </button>
      </div>

      <div className="modal" style={{ maxWidth: 420, margin: 0 }}>
        <h3>Pack de Tickets (venta online)</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Precio (IVA incluido) del pack base de {CANTIDAD_MINIMA_TICKETS} tickets que se vende en &quot;Tipo de
          Lavados&quot; del portal cliente — define también el precio unitario para cantidades mayores — y cuántos
          días de vigencia tienen los tickets desde que se compran, a propósito no amarrado a los 90 días de otros
          productos.
        </div>

        <div className="field">
          <label>{CANTIDAD_MINIMA_TICKETS} Tickets</label>
          <PriceInput value={precioTicketsVal} onChange={setPrecioTicketsVal} />
        </div>

        <div className="field">
          <label>Días de vigencia de los tickets</label>
          <input type="number" min={1} value={vigenciaVal} onChange={(e) => setVigenciaVal(e.target.value)} />
        </div>

        <div className="err" style={{ color: msgEmpresa?.ok ? "var(--green)" : undefined }}>{msgEmpresa?.texto || ""}</div>
        <button className="btn" onClick={guardarEmpresa}>
          Guardar Pack de Tickets
        </button>
      </div>

      <div className="modal" style={{ maxWidth: 420, margin: "20px 0 0 0" }}>
        <h3>Detailing por tamaño (S/M/L/XL)</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Precio de cada servicio de {CATEGORIA_DETAILING.toLowerCase()} según el tamaño del vehículo, tal como lo ve
          el cliente al cotizar en la web. Un tamaño en 0 cae de vuelta al precio general del servicio (
          {serviciosDetailing
            .map((s) => `${s.nombre}: ${fmtCLP(precioServicio(data.precios, s.id))}`)
            .join(" · ")}
          ).
        </div>

        {serviciosDetailing.length === 0 && (
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
            No hay servicios en la categoría &quot;{CATEGORIA_DETAILING}&quot; todavía.
          </div>
        )}

        {serviciosDetailing.map((s) => (
          <div key={s.id} style={{ marginBottom: 14 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>{s.nombre}</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {TAMANOS_VEHICULO.map((t) => (
                <div className="field" key={t} style={{ width: 100, margin: 0 }}>
                  <label>{TAMANO_LABEL[t]}</label>
                  <PriceInput
                    value={detailingVal[s.id]?.[t] ?? ""}
                    onChange={(v) => setDetailingVal((prev) => ({ ...prev, [s.id]: { ...prev[s.id], [t]: v } }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="err" style={{ color: msgDetailing?.ok ? "var(--green)" : undefined }}>{msgDetailing?.texto || ""}</div>
        <button className="btn" onClick={guardarDetailing} disabled={serviciosDetailing.length === 0}>
          Guardar Detailing por tamaño
        </button>
      </div>
    </div>
  );
}
