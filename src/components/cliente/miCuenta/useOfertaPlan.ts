"use client";

import { useState } from "react";
import { redirigirAWebpay } from "@/lib/webpayClient";

export type TipoOfertaPlan = "renovacion_temprana" | "reactivacion" | "upgrade_plan";

// "renovacion" no es una promoción de cuenta (es el tipo público de /pagar,
// ver TIPOS_PROMO_CUENTA en /api/pagos/webpay/crear): se usa para pagar un
// plan vencido que quedó fuera de todos los tramos de reactivación (ver
// OfertaPlan.pagoVencido) y siempre va por Webpay — cobrar-oferta solo sabe
// cobrar las 3 promos contra la tarjeta guardada.
type TipoCobro = TipoOfertaPlan | "renovacion";

export interface TarjetaGuardada {
  cardTipo: string | null;
  cardUltimosDigitos: string | null;
}

/**
 * Cobra una de las 3 promociones de plan que ofrece VehiculoCard (ver
 * @/lib/helpers/ofertasPlan). Si la patente ya tiene una tarjeta Oneclick
 * activa (`tarjeta`), pide confirmación y cobra directo contra ella vía
 * /api/cliente/mi-cuenta/cobrar-oferta — sin pasar por Webpay Plus, que
 * exigiría reingresar los datos de una tarjeta que el cliente ya guardó. Sin
 * tarjeta guardada, cae al flujo de siempre (redirigirAWebpay): ahí no hace
 * falta un paso de confirmación propio porque Webpay ya muestra el suyo.
 */
export function useOfertaPlan(patente: string, tarjeta: TarjetaGuardada | null, onCobrado: () => void) {
  const [pagando, setPagando] = useState<TipoCobro | null>(null);
  const [confirmando, setConfirmando] = useState<TipoOfertaPlan | null>(null);
  const [err, setErr] = useState("");
  // Distingue "la tarjeta guardada fue rechazada" de cualquier otro error
  // (sin conexión, promoción vencida, etc.) — VehiculoCard lo usa para recién
  // ahí mostrar la salida real a Webpay que el mensaje de error promete (ver
  // pagarPorWebpayEnCambio): antes ese mensaje no tenía ningún botón detrás,
  // así que un cliente cuya tarjeta se rechazó quedaba sin forma de completar
  // la promoción salvo recargar la página.
  const [rechazada, setRechazada] = useState(false);

  async function pagarWebpay(tipo: TipoCobro) {
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
      pagarWebpay(tipo);
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
        setErr("La tarjeta fue rechazada. Puedes reintentar o pagar por Webpay.");
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

  // Salida real hacia Webpay tras un rechazo: `pedir()` solo elige Webpay
  // cuando no hay ninguna tarjeta guardada, así que sin esto reintentar tras
  // un rechazo volvía a caer en el mismo cobro directo contra la misma
  // tarjeta rechazada.
  function pagarPorWebpayEnCambio() {
    if (!confirmando) return;
    pagarWebpay(confirmando);
  }

  return {
    pagando,
    confirmando,
    err,
    rechazada,
    pedir,
    cancelarConfirmacion,
    confirmarConTarjeta,
    pagarPorWebpayEnCambio,
    pagarPlanVencido: () => pagarWebpay("renovacion"),
  };
}
