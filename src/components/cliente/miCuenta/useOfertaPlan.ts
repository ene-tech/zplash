"use client";

import { useState } from "react";
import { redirigirAWebpay } from "@/lib/webpayClient";

export type TipoOfertaPlan = "renovacion_temprana" | "reactivacion" | "upgrade_plan";

// "renovacion" no es una promoción de cuenta: es el único plan que todavía se
// paga por Webpay (ver TIPOS_VALIDOS en /api/pagos/webpay/crear) — el plan
// vencido que quedó fuera de todos los tramos de reactivación (ver
// OfertaPlan.pagoVencido). Las 3 promociones se cobran contra la tarjeta
// inscrita, nunca por Webpay.
type TipoCobro = TipoOfertaPlan | "renovacion";

export interface TarjetaGuardada {
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
}

/**
 * Cobra una de las 3 promociones de plan que ofrece VehiculoCard (ver
 * @/lib/helpers/ofertasPlan). El plan solo se paga con tarjeta inscrita
 * (Oneclick), nunca por Webpay: si la patente ya tiene una activa (`tarjeta`)
 * se pide confirmación y se cobra directo contra ella vía
 * /api/cliente/mi-cuenta/cobrar-oferta; si no tiene, `onSinTarjeta` manda a
 * inscribir una y ese mismo retorno hace el primer cobro con el precio de la
 * promoción (ver promoPrimerCobroOneclick).
 */
export function useOfertaPlan(patente: string, tarjeta: TarjetaGuardada | null, onCobrado: () => void, onSinTarjeta: () => void) {
  const [pagando, setPagando] = useState<TipoCobro | null>(null);
  const [confirmando, setConfirmando] = useState<TipoOfertaPlan | null>(null);
  const [err, setErr] = useState("");
  // Distingue "la tarjeta guardada fue rechazada" de cualquier otro error
  // (sin conexión, promoción vencida, etc.): VehiculoCard lo usa para
  // cambiarle el texto al botón de cobro y para ofrecer inscribir otra
  // tarjeta, que es la única salida cuando la guardada no pasa.
  const [rechazada, setRechazada] = useState(false);

  // Solo para el plan vencido sin promoción (ver TipoCobro): las 3
  // promociones no pasan por Webpay.
  async function pagarWebpay(tipo: "renovacion") {
    setErr("");
    setPagando(tipo);
    try {
      const res = await fetch("/api/pagos/webpay/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, items: [{ tipo }] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo iniciar el pago");
        setPagando(null);
        return;
      }
      redirigirAWebpay(data.url, data.token);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setPagando(null);
    }
  }

  function pedir(tipo: TipoOfertaPlan) {
    setErr("");
    setRechazada(false);
    if (tarjeta) {
      setConfirmando(tipo);
    } else {
      onSinTarjeta();
    }
  }

  // Igual que QuitarVehiculo/SolicitudCambioPatente: si el cobro falla, el
  // modal se queda abierto mostrando el error (no se cierra solo) — el
  // cliente puede reintentar o cancelar. Solo se cierra al confirmar bien.
  async function confirmarConTarjeta() {
    if (!confirmando) return;
    const tipo = confirmando;
    setErr("");
    setRechazada(false);
    setPagando(tipo);
    try {
      const res = await fetch("/api/cliente/mi-cuenta/cobrar-oferta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente, tipo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo cobrar la tarjeta");
        setPagando(null);
        return;
      }
      if (data.estado === "rechazada") {
        setErr("La tarjeta fue rechazada. Puedes reintentar o inscribir otra tarjeta.");
        setRechazada(true);
        setPagando(null);
        return;
      }
      setPagando(null);
      setConfirmando(null);
      onCobrado();
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setPagando(null);
    }
  }

  function cancelarConfirmacion() {
    setConfirmando(null);
    setErr("");
    setRechazada(false);
  }

  return {
    pagando,
    confirmando,
    err,
    rechazada,
    pedir,
    cancelarConfirmacion,
    confirmarConTarjeta,
    pagarPlanVencido: () => pagarWebpay("renovacion"),
  };
}
