"use client";

import { useState } from "react";
import { formatRut, isValidEmail, isValidRut } from "@/lib/helpers";
import type { DatosDocumento } from "./usePagarForm";

// Estado + validación del paso "Boleta o Factura": mismos 5 campos y misma
// regla (Factura exige los 5, Boleta ninguno) que ya usaba PagoUnicoCard,
// ahora compartidos también con el flujo de Plan/Renovación (ver
// ResultadoBusqueda) y Servicios puntuales (ver ServicioDocumentoCard en
// PagarForm) para no triplicar los mismos inputs.
export function useDatosDocumento() {
  const [tipoDocumento, setTipoDocumento] = useState<DatosDocumento["tipoDocumento"]>("Boleta");
  const [razonSocial, setRazonSocial] = useState("");
  const [rut, setRut] = useState("");
  const [direccion, setDireccion] = useState("");
  const [giro, setGiro] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function onRutBlur() {
    setRut((r) => (isValidRut(r) ? formatRut(r) : r));
  }

  // Para ResultadoBusqueda, que a diferencia de PagoUnicoCard/ServicioDocumentoCard
  // no se desmonta entre pagos (sigue montado mientras dura la sesión en /pagar):
  // sin esto, los datos de una Factura llenados para una patente quedarían
  // precargados si el cliente busca otra patente distinta y vuelve a pagar.
  function reset() {
    setTipoDocumento("Boleta");
    setRazonSocial("");
    setRut("");
    setDireccion("");
    setGiro("");
    setEmail("");
    setError("");
  }

  function validar(): DatosDocumento | null {
    if (tipoDocumento !== "Factura") {
      setError("");
      return { tipoDocumento };
    }
    if (!razonSocial.trim() || !rut.trim() || !direccion.trim() || !giro.trim() || !email.trim()) {
      setError("Completa Razón Social, RUT, Giro, Dirección y Correo para la factura.");
      return null;
    }
    if (!isValidRut(rut)) {
      setError("RUT inválido. Ej: 12.345.678-9");
      return null;
    }
    if (!isValidEmail(email)) {
      setError("Correo inválido.");
      return null;
    }
    setError("");
    return {
      tipoDocumento,
      razonSocial: razonSocial.trim(),
      rut: formatRut(rut),
      direccion: direccion.trim(),
      giro: giro.trim(),
      email: email.trim().toLowerCase(),
    };
  }

  return {
    tipoDocumento,
    setTipoDocumento,
    razonSocial,
    setRazonSocial,
    rut,
    setRut,
    onRutBlur,
    direccion,
    setDireccion,
    giro,
    setGiro,
    email,
    setEmail,
    error,
    validar,
    reset,
  };
}

export type DatosDocumentoForm = ReturnType<typeof useDatosDocumento>;
