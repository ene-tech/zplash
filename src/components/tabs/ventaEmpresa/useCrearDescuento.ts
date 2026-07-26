"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { PATENTE_FORMATO_MSG, generarCodigoCupon, isValidPatente, normPlate, uid } from "@/lib/helpers";
import type { Cupon } from "@/types";

type CrearDescuentoRefs = {
  dNombreRef: RefObject<HTMLInputElement | null>;
  dCaducidadRef: RefObject<HTMLInputElement | null>;
  dPatenteRef: RefObject<HTMLInputElement | null>;
};

// Genera un código de descuento (resta % o monto fijo del precio a cobrar al
// canjearlo desde el perfil operador) — distinto de un cupón "vale", nunca
// se registra como venta acá. Puede quedar abierto (cualquier patente) o
// asignado a una específica.
export function useCrearDescuento(refs: CrearDescuentoRefs) {
  const { data, commit } = useApp();
  const { dNombreRef, dCaducidadRef, dPatenteRef } = refs;
  const [dValorTexto, setDValorTexto] = useState("");
  const [dTipoValor, setDTipoValor] = useState<"monto" | "porcentaje">("monto");
  const [dAbierto, setDAbierto] = useState(false);
  const [errDescuento, setErrDescuento] = useState<{ msg: string; ok: boolean } | null>(null);

  const crearDescuento = async () => {
    const nombreLote = dNombreRef.current?.value.trim() || "";
    const valor = Number(dValorTexto || 0);
    const fechaCaducidad = dCaducidadRef.current?.value || "";
    const patente = dAbierto ? "" : normPlate(dPatenteRef.current?.value || "");
    if (!nombreLote || !valor || valor <= 0 || !fechaCaducidad) {
      setErrDescuento({ msg: "Completa nombre, valor y fecha de caducidad", ok: false });
      return;
    }
    if (dTipoValor === "porcentaje" && valor > 100) {
      setErrDescuento({ msg: "El porcentaje no puede ser mayor a 100", ok: false });
      return;
    }
    if (!dAbierto && !isValidPatente(patente)) {
      setErrDescuento({ msg: PATENTE_FORMATO_MSG, ok: false });
      return;
    }

    const existentes = new Set(data.cupones.map((c) => c.codigo));
    const codigo = generarCodigoCupon(existentes);
    const nuevo: Cupon = {
      id: uid(),
      codigo,
      nombreLote,
      valor,
      numeroLote: 1,
      totalLote: 1,
      fechaCaducidad: new Date(fechaCaducidad + "T23:59:59").toISOString(),
      usado: false,
      creadoEn: new Date().toISOString(),
      creadoPor: "Administrador",
      tipo: "descuento",
      esPorcentaje: dTipoValor === "porcentaje",
      patenteAsignada: dAbierto ? undefined : patente,
    };

    const ok = await commit({ cupones: [nuevo, ...data.cupones] });
    if (!ok) {
      setErrDescuento({ msg: "No se pudo crear el descuento (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErrDescuento({
      msg: `Descuento "${nombreLote}" creado — código ${codigo}${dAbierto ? " (abierto, cualquier patente)" : ` para ${patente}`}`,
      ok: true,
    });
    if (dNombreRef.current) dNombreRef.current.value = "";
    setDValorTexto("");
    if (dCaducidadRef.current) dCaducidadRef.current.value = "";
    if (dPatenteRef.current) dPatenteRef.current.value = "";
    setDTipoValor("monto");
    setDAbierto(false);
  };

  return { dValorTexto, setDValorTexto, dTipoValor, setDTipoValor, dAbierto, setDAbierto, errDescuento, crearDescuento };
}
