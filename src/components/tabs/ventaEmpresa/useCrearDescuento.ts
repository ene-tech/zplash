"use client";

import { useState, type RefObject } from "react";
import { useAppData } from "@/context/AppContext";
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
// asignado a una específica, y con dos límites opcionales: solo clientes
// nuevos (patente sin ficha) y un uso por patente (el código no muere en el
// primer canje). Ver resolverDescuento en @/lib/helpers/cupones.
export function useCrearDescuento(refs: CrearDescuentoRefs) {
  const { data, commit } = useAppData();
  const { dNombreRef, dCaducidadRef, dPatenteRef } = refs;
  const [dValorTexto, setDValorTexto] = useState("");
  const [dTipoValor, setDTipoValor] = useState<"monto" | "porcentaje">("monto");
  const [dAbierto, setDAbierto] = useState(false);
  const [dSoloNuevos, setDSoloNuevos] = useState(false);
  const [dUnUsoPorPatente, setDUnUsoPorPatente] = useState(false);
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
      soloClientesNuevos: dSoloNuevos,
      // Un código atado a UNA patente ya es de un uso: la regla solo tiene
      // sentido en uno abierto (ver el checkbox en CrearDescuentoForm).
      unUsoPorPatente: dAbierto && dUnUsoPorPatente,
    };

    const ok = await commit({ cupones: [nuevo, ...data.cupones] });
    if (!ok) {
      setErrDescuento({ msg: "No se pudo crear el descuento (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErrDescuento({
      msg:
        `Descuento "${nombreLote}" creado — código ${codigo}${dAbierto ? " (abierto, cualquier patente)" : ` para ${patente}`}` +
        (nuevo.unUsoPorPatente ? " · un uso por patente" : "") +
        (dSoloNuevos ? " · solo clientes nuevos" : ""),
      ok: true,
    });
    if (dNombreRef.current) dNombreRef.current.value = "";
    setDValorTexto("");
    if (dCaducidadRef.current) dCaducidadRef.current.value = "";
    if (dPatenteRef.current) dPatenteRef.current.value = "";
    setDTipoValor("monto");
    setDAbierto(false);
    setDSoloNuevos(false);
    setDUnUsoPorPatente(false);
  };

  return {
    dValorTexto,
    setDValorTexto,
    dTipoValor,
    setDTipoValor,
    dAbierto,
    setDAbierto,
    dSoloNuevos,
    setDSoloNuevos,
    dUnUsoPorPatente,
    setDUnUsoPorPatente,
    errDescuento,
    crearDescuento,
  };
}
