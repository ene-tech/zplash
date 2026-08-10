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
}

export type TipoPago = "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" | "aspirado";
export type AccionPlan = { tipo: "plan_nuevo" | "renovacion"; label: string };
export type PasoMetodo = "elegir" | "google-conectando" | "google-preview";

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
// por patente, pagar cualquier ítem (plan/renovación/servicio/lavado único/
// aspirado) vía Webpay, el flujo de elegir método de pago (invitado vs.
// vista previa de Google) antes de confirmar, y activar la renovación
// automática (Oneclick).
export function usePagarForm() {
  const params = useSearchParams();
  const item = params.get("item");
  const soloPagoUnico = item === "plan" && params.get("auto") !== "1";
  const [patente, setPatente] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [err, setErr] = useState("");
  const [resultado, setResultado] = useState<EstadoPlan | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [mostrarAuto, setMostrarAuto] = useState(params.get("auto") === "1");
  const [email, setEmail] = useState("");
  const [inscribiendo, setInscribiendo] = useState(false);
  const [accionPlan, setAccionPlan] = useState<AccionPlan | null>(null);
  const [pasoMetodo, setPasoMetodo] = useState<PasoMetodo | null>(null);

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

  function elegirMetodo(tipo: "plan_nuevo" | "renovacion", label: string) {
    setAccionPlan({ tipo, label });
    setPasoMetodo("elegir");
  }

  function cancelarMetodo() {
    setAccionPlan(null);
    setPasoMetodo(null);
  }

  function conectarGoogle() {
    setPasoMetodo("google-conectando");
    setTimeout(() => setPasoMetodo("google-preview"), 600);
  }

  function confirmarPago() {
    if (!accionPlan) return;
    const tipo = accionPlan.tipo;
    setAccionPlan(null);
    setPasoMetodo(null);
    pagar(tipo);
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
    soloPagoUnico,
    patente,
    setPatente,
    buscando,
    err,
    resultado,
    pagando,
    mostrarAuto,
    setMostrarAuto,
    email,
    setEmail,
    inscribiendo,
    accionPlan,
    pasoMetodo,
    buscar,
    pagar,
    elegirMetodo,
    cancelarMetodo,
    conectarGoogle,
    confirmarPago,
    activarAutomatica,
  };
}
