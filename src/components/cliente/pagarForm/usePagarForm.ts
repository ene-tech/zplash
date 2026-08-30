"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { isValidEmail, isValidPatente, normPlate } from "@/lib/helpers";
import { redirigirAInscripcionOneclick, redirigirAWebpay } from "@/lib/webpayClient";

export interface EstadoPlan {
  encontrado: boolean;
  nombre?: string;
  plan?: string;
  vencimiento?: string | null;
  estado?: { label: string; cls: "ok" | "warn" | "bad"; diasRestantes?: number };
  // Cuánto le está descontando un cupón vigente de esta patente al precio del
  // plan (0/undefined = ninguno) — ya viene restado de `precioPrimerCobroAuto`,
  // esto es solo para poder explicarlo en pantalla.
  descuentoCupon?: number;
  // Solo para el precio de la renovación automática (Oneclick), que respeta
  // el heredado sin depender del plazo de atraso.
  precioPlanHeredado?: number | null;
  // Precio del PRIMER cobro de la renovación automática cuando sale más
  // barato que el mensual: promoción de reactivación/upgrade (ver
  // promoPrimerCobroOneclick) y/o cupón de descuento de la patente. Es lo que
  // va a cobrar la inscripción de tarjeta, resuelto por /api/pagos/estado con
  // los mismos helpers que cobran /api/pagos/oneclick/inscripcion/retorno.
  // undefined = paga el precio de siempre de la renovación automática.
  precioPrimerCobroAuto?: number;
  // Le queda el lavado full túnel gratis por inscribir la tarjeta estando
  // vencido (una sola vez por cliente).
  ticketReactivacion?: boolean;
}

// El plan NO está acá: solo se paga inscribiendo la tarjeta (ver
// activarAutomatica), nunca por Webpay.
export type TipoPago = "servicio" | "lavado_unico" | "aspirado";
export type AccionServicio = { id: string; nombre: string; precio: number };

// Datos de boleta/factura que junta PagoUnicoCard antes de cobrar (ver
// mismo esquema de columnas ya usado por pagosWebpayItems para Pack
// Empresa): si tipoDocumento es "Boleta" no lleva los demás campos.
export interface DatosDocumento {
  tipoDocumento: "Boleta" | "Factura";
  razonSocial?: string;
  rut?: string;
  direccion?: string;
  giro?: string;
  email?: string;
}

// Lógica de la pantalla pública "Pagar en ZPlash": buscar el estado del plan
// por patente, pagar por Webpay los ítems sueltos (servicio/lavado único/
// aspirado) y activar la renovación automática (Oneclick), que es la única
// forma de contratar o renovar el plan.
export function usePagarForm() {
  const params = useSearchParams();
  const item = params.get("item");
  const [patente, setPatente] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [err, setErr] = useState("");
  const [resultado, setResultado] = useState<EstadoPlan | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inscribiendo, setInscribiendo] = useState(false);
  const [accionServicio, setAccionServicio] = useState<AccionServicio | null>(null);

  async function buscar() {
    const p = normPlate(patente);
    if (!isValidPatente(p)) {
      setErr("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    setErr("");
    setBuscando(true);
    setResultado(null);
    try {
      const res = await fetch(`/api/pagos/estado?patente=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo consultar el estado");
        return;
      }
      setResultado(data);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
    } finally {
      setBuscando(false);
    }
  }

  async function pagar(tipo: TipoPago, servicioId?: string, key?: string, datosDocumento?: DatosDocumento) {
    const p = normPlate(patente);
    if (!isValidPatente(p)) {
      setErr("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    setErr("");
    setPagando(key || tipo);
    try {
      const res = await fetch("/api/pagos/webpay/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: p, items: [{ tipo, servicioId, ...datosDocumento }] }),
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

  function elegirServicio(id: string, nombre: string, precio: number) {
    setErr("");
    setAccionServicio({ id, nombre, precio });
  }

  function cancelarServicio() {
    setAccionServicio(null);
  }

  function confirmarServicio(datosDocumento: DatosDocumento) {
    if (!accionServicio) return;
    const { id } = accionServicio;
    setAccionServicio(null);
    pagar("servicio", id, id, datosDocumento);
  }

  async function activarAutomatica() {
    const p = normPlate(patente);
    if (!isValidPatente(p)) {
      setErr("Patente inválida. Ej: AB1234 o ABCD12.");
      return;
    }
    if (!isValidEmail(email)) {
      setErr("Email inválido.");
      return;
    }
    setErr("");
    setInscribiendo(true);
    try {
      const res = await fetch("/api/pagos/oneclick/inscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patente: p, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "No se pudo iniciar la inscripción");
        setInscribiendo(false);
        return;
      }
      redirigirAInscripcionOneclick(data.url, data.token);
    } catch {
      setErr("Sin conexión. Intenta de nuevo.");
      setInscribiendo(false);
    }
  }

  return {
    item,
    patente,
    setPatente,
    buscando,
    err,
    resultado,
    pagando,
    email,
    setEmail,
    inscribiendo,
    accionServicio,
    buscar,
    pagar,
    elegirServicio,
    cancelarServicio,
    confirmarServicio,
    activarAutomatica,
  };
}
