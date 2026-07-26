"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { subirComprobanteGasto } from "@/lib/db";
import { CANAL_INGRESO_OTROS, CANAL_INGRESO_TUNEL, RUT_FORMATO_MSG, esEstadoPagadoEgreso, formatRut, isValidRut, todayYMD } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";

export const CONTRAPARTE_LABEL: Record<MovimientoContable["tipo"], string> = {
  ingreso: "Cliente / Origen",
  egreso: "Nombre del Proveedor",
  cuenta_por_cobrar: "Cliente",
};

type FormRefs = {
  fechaRef: RefObject<HTMLInputElement | null>;
  descripcionRef: RefObject<HTMLInputElement | null>;
  contraparteRef: RefObject<HTMLInputElement | null>;
  rutProveedorRef: RefObject<HTMLInputElement | null>;
  numeroFacturaRef: RefObject<HTMLInputElement | null>;
  notasRef: RefObject<HTMLTextAreaElement | null>;
  archivoInputRef: RefObject<HTMLInputElement | null>;
};

// Formulario de alta de un Movimiento Contable (ingreso o egreso, según
// `tipo`): valida los campos según el tipo, sube el comprobante adjunto si
// corresponde (solo egresos) y arma el registro final.
export function useMovimientoContableForm(tipo: MovimientoContable["tipo"], refs: FormRefs) {
  const { data, commit } = useApp();
  const { fechaRef, descripcionRef, contraparteRef, rutProveedorRef, numeroFacturaRef, notasRef, archivoInputRef } = refs;
  const glosasGasto = data.categoriasGasto.filter((c) => c.activa).map((c) => ({ categoria: c.nombre, grupo: c.grupo }));
  const canalesIngreso = data.categoriasIngreso.filter((c) => c.activa);

  const [categoriaGasto, setCategoriaGasto] = useState("");
  const [categoriaIngreso, setCategoriaIngreso] = useState("");
  const [comentarioOtros, setComentarioOtros] = useState("");
  const [montoTexto, setMontoTexto] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<"Boleta" | "Factura" | null>(null);
  const [estado, setEstado] = useState<MovimientoContable["estado"]>(tipo === "egreso" ? "pagado_cc" : "pagado");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const estadoBloqueadoPagado = tipo === "ingreso" && categoriaIngreso === CANAL_INGRESO_TUNEL;

  const onCategoriaIngresoChange = (v: string) => {
    setCategoriaIngreso(v);
    if (v === CANAL_INGRESO_TUNEL) setEstado("pagado");
  };

  const agregar = async () => {
    const fecha = fechaRef.current?.value || todayYMD();
    const categoria =
      tipo === "egreso"
        ? categoriaGasto.trim()
        : categoriaIngreso === CANAL_INGRESO_OTROS
          ? comentarioOtros.trim()
            ? `${CANAL_INGRESO_OTROS}: ${comentarioOtros.trim()}`
            : CANAL_INGRESO_OTROS
          : categoriaIngreso;
    const contraparte = contraparteRef.current?.value.trim() || "";
    const descripcion =
      tipo === "ingreso" ? categoria + (contraparte ? ` – ${contraparte}` : "") : descripcionRef.current?.value.trim() || "";
    const rutProveedor = tipo === "egreso" ? rutProveedorRef.current?.value.trim() || "" : "";
    const numeroFactura = tipo === "egreso" ? numeroFacturaRef.current?.value.trim() || "" : "";
    const monto = Number(montoTexto || 0);
    const notas = notasRef.current?.value.trim() || "";

    if (tipo === "egreso" && !descripcion) {
      setErr({ msg: "Completa la descripción", ok: false });
      return;
    }
    if (tipo === "egreso" && !glosasGasto.some((g) => g.categoria === categoria)) {
      setErr({ msg: "Selecciona un tipo de gasto de la lista", ok: false });
      return;
    }
    if (tipo === "ingreso" && !categoriaIngreso) {
      setErr({ msg: "Selecciona una categoría", ok: false });
      return;
    }
    if (!monto || monto <= 0) {
      setErr({ msg: "Ingresa un monto válido", ok: false });
      return;
    }
    if (tipo === "egreso" && !tipoDocumento) {
      setErr({ msg: "Selecciona Boleta o Factura", ok: false });
      return;
    }
    if (rutProveedor && !isValidRut(rutProveedor)) {
      setErr({ msg: RUT_FORMATO_MSG, ok: false });
      return;
    }
    if (tipo === "ingreso" && estado === "pagado" && !metodoPago) {
      setErr({ msg: "Selecciona Efectivo, Tarjeta o Transferencia bancaria", ok: false });
      return;
    }

    const id = "mc" + Date.now() + Math.floor(Math.random() * 1000);
    let documentoUrl: string | undefined;
    let documentoNombre: string | undefined;
    if (tipo === "egreso" && archivo) {
      setSubiendo(true);
      const url = await subirComprobanteGasto(id, archivo);
      setSubiendo(false);
      if (!url) {
        setErr({ msg: "No se pudo subir el documento adjunto. Intenta de nuevo.", ok: false });
        return;
      }
      documentoUrl = url;
      documentoNombre = archivo.name;
    }

    const nuevo: MovimientoContable = {
      id,
      tipo,
      fecha: new Date(fecha + "T12:00:00").toISOString(),
      descripcion,
      categoria: categoria || undefined,
      contraparte: contraparte || undefined,
      rutProveedor: rutProveedor ? formatRut(rutProveedor) : undefined,
      numeroFactura: numeroFactura || undefined,
      tipoDocumento: tipoDocumento || undefined,
      documentoUrl,
      documentoNombre,
      monto,
      estado: estadoBloqueadoPagado ? "pagado" : estado,
      metodoPago: tipo === "ingreso" && estado === "pagado" ? metodoPago || undefined : undefined,
      notas: notas || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: "Administración",
      fechaPago: tipo === "egreso" && esEstadoPagadoEgreso(estado) ? new Date().toISOString() : undefined,
    };

    const ok = await commit({ movimientosContables: [nuevo, ...data.movimientosContables] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Movimiento registrado correctamente", ok: true });
    if (fechaRef.current) fechaRef.current.value = "";
    if (descripcionRef.current) descripcionRef.current.value = "";
    setCategoriaGasto("");
    setCategoriaIngreso("");
    setComentarioOtros("");
    if (contraparteRef.current) contraparteRef.current.value = "";
    if (rutProveedorRef.current) rutProveedorRef.current.value = "";
    if (numeroFacturaRef.current) numeroFacturaRef.current.value = "";
    setMontoTexto("");
    if (notasRef.current) notasRef.current.value = "";
    setTipoDocumento(null);
    setArchivo(null);
    if (archivoInputRef.current) archivoInputRef.current.value = "";
    setEstado(tipo === "egreso" ? "pagado_cc" : "pagado");
    setMetodoPago(null);
  };

  return {
    glosasGasto,
    canalesIngreso,
    categoriaGasto,
    setCategoriaGasto,
    categoriaIngreso,
    onCategoriaIngresoChange,
    comentarioOtros,
    setComentarioOtros,
    montoTexto,
    setMontoTexto,
    tipoDocumento,
    setTipoDocumento,
    estado,
    setEstado,
    metodoPago,
    setMetodoPago,
    setArchivo,
    subiendo,
    err,
    estadoBloqueadoPagado,
    agregar,
  };
}
