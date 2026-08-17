"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { PATENTE_FORMATO_MSG, RUT_FORMATO_MSG, fmtCLP, formatRut, generarCodigoCupon, isValidPatente, isValidRut, parsearPatentes, uid } from "@/lib/helpers";
import type { Cupon, Empresa, Venta } from "@/types";

type GenerarCuponesRefs = {
  nombreRef: RefObject<HTMLInputElement | null>;
  cantidadRef: RefObject<HTMLInputElement | null>;
  caducidadRef: RefObject<HTMLInputElement | null>;
  razonSocialRef: RefObject<HTMLInputElement | null>;
  rutRef: RefObject<HTMLInputElement | null>;
  direccionRef: RefObject<HTMLInputElement | null>;
  giroRef: RefObject<HTMLInputElement | null>;
};

// Genera un lote de cupones "vale" (entrada gratis o prepagada) para vender
// a una empresa: el valor total del lote (si corresponde) se registra como
// una única Venta en el cierre de caja de hoy, y cada cupón se canjea
// después por separado desde el perfil operador.
export function useGenerarCupones(refs: GenerarCuponesRefs) {
  const { data, commit } = useApp();
  const { nombreRef, cantidadRef, caducidadRef, razonSocialRef, rutRef, direccionRef, giroRef } = refs;
  const [valorTexto, setValorTexto] = useState("");
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [hayValor, setHayValor] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [estadoTransferencia, setEstadoTransferencia] = useState<"pagado" | "pendiente" | null>(null);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const [patentesAbierto, setPatentesAbierto] = useState(true);
  const [patentesTexto, setPatentesTexto] = useState("");
  const [unCuponPorPatente, setUnCuponPorPatente] = useState(false);

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos en vez de tipearlos de nuevo.
  // Si no existe, generar() la crea a través del mismo formulario de Empresas.
  const onRutBlur = () => {
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (rutRef.current) rutRef.current.value = rutFormateado;
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rutFormateado);
    if (!empresa) return;
    if (razonSocialRef.current) razonSocialRef.current.value = empresa.razonSocial;
    if (direccionRef.current) direccionRef.current.value = empresa.direccion || "";
    if (giroRef.current) giroRef.current.value = empresa.giro || "";
  };

  const generar = async () => {
    const nombreLote = nombreRef.current?.value.trim() || "";
    const cantidad = Number(cantidadRef.current?.value || 0);
    const valorTotal = Number(valorTexto || 0);
    const fechaCaducidad = caducidadRef.current?.value || "";
    if (!nombreLote || !cantidad || cantidad < 1 || !fechaCaducidad) {
      setErr({ msg: "Completa nombre, cantidad y fecha de caducidad", ok: false });
      return;
    }
    if (cantidad > 500) {
      setErr({ msg: "Máximo 500 cupones por lote", ok: false });
      return;
    }
    if (valorTotal > 0 && tipoDoc === "Factura") {
      const razonSocial = razonSocialRef.current?.value.trim();
      const rut = rutRef.current?.value.trim();
      const direccion = direccionRef.current?.value.trim();
      const giro = giroRef.current?.value.trim();
      if (!razonSocial || !rut || !direccion || !giro) {
        setErr({ msg: "Completa Razón Social, RUT, Dirección y Giro para la factura", ok: false });
        return;
      }
      if (!isValidRut(rut)) {
        setErr({ msg: RUT_FORMATO_MSG, ok: false });
        return;
      }
    }
    if (valorTotal > 0 && !metodoPago) {
      setErr({ msg: "Selecciona la forma de pago", ok: false });
      return;
    }
    if (valorTotal > 0 && metodoPago === "transferencia" && !estadoTransferencia) {
      setErr({ msg: "Indica si la transferencia está pagada o por pagar", ok: false });
      return;
    }

    const razonSocial = tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rut = tipoDoc === "Factura" ? formatRut(rutRef.current?.value.trim() || "") : "";
    const direccion = tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "";
    const patentesAutorizadas = patentesAbierto ? undefined : parsearPatentes(patentesTexto);
    if (patentesAutorizadas) {
      const invalida = patentesAutorizadas.find((p) => !isValidPatente(p));
      if (invalida) {
        setErr({ msg: `Patente inválida: ${invalida}. ${PATENTE_FORMATO_MSG}`, ok: false });
        return;
      }
      // Con las dos reglas juntas el lote se queda sin canjes posibles apenas
      // cada patente autorizada use el suyo: se avisa acá en vez de generar
      // cupones que nadie va a poder canjear.
      if (unCuponPorPatente && patentesAutorizadas.length < cantidad) {
        setErr({
          msg: `Con un cupón por patente necesitas al menos ${cantidad} patentes autorizadas (hay ${patentesAutorizadas.length}): el resto del lote quedaría sin poder canjearse`,
          ok: false,
        });
        return;
      }
    }

    const valorPorCupon = Math.round(valorTotal / cantidad);
    const existentes = new Set(data.cupones.map((c) => c.codigo));
    const nuevos: Cupon[] = [];
    for (let i = 0; i < cantidad; i++) {
      const codigo = generarCodigoCupon(existentes);
      existentes.add(codigo);
      nuevos.push({
        id: "cup" + Date.now() + i + Math.floor(Math.random() * 1000),
        codigo,
        nombreLote,
        valor: valorPorCupon,
        numeroLote: i + 1,
        totalLote: cantidad,
        fechaCaducidad: new Date(fechaCaducidad + "T23:59:59").toISOString(),
        usado: false,
        creadoEn: new Date().toISOString(),
        creadoPor: "Administrador",
        tipo: "vale",
        rut: rut || undefined,
        patentesAutorizadas: patentesAutorizadas?.length ? patentesAutorizadas : undefined,
        unCuponPorPatente,
      });
    }

    let ventas = data.ventas;
    if (valorTotal > 0) {
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: "",
        patente: "",
        nombre: `Venta Empresa · ${nombreLote}`,
        plan: "",
        precio: valorTotal,
        tipo: "Cupón Venta Empresa",
        fecha: new Date().toISOString(),
        creadoPor: "Administrador",
        tipoDocumento: tipoDoc,
        razonSocial,
        rut,
        direccion,
        giro,
        metodoPago: metodoPago || undefined,
        estadoPago: metodoPago === "transferencia" ? estadoTransferencia || undefined : "pagado",
      };
      ventas = [venta, ...ventas];
    }

    // El RUT manda: si es Factura y ese RUT no pertenece a ninguna empresa ya
    // registrada, se crea una nueva en Empresas (sin contacto asignado, igual
    // que al crearla manualmente desde esa pestaña).
    let nuevaEmpresa: Empresa | undefined;
    if (tipoDoc === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        creadoEn: new Date().toISOString(),
        creadoPor: "Administrador",
      };
    }

    const ok = await commit({
      cupones: [...nuevos, ...data.cupones],
      ventas,
      ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    });
    if (!ok) {
      setErr({ msg: "No se pudieron generar los cupones (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({
      msg:
        `${cantidad} cupones generados para "${nombreLote}"` +
        (unCuponPorPatente ? " (un cupón por patente)" : "") +
        (valorTotal > 0 ? ` — se registró ${fmtCLP(valorTotal)} en el cierre de caja de hoy` : ""),
      ok: true,
    });
    if (nombreRef.current) nombreRef.current.value = "";
    if (cantidadRef.current) cantidadRef.current.value = "";
    setValorTexto("");
    if (caducidadRef.current) caducidadRef.current.value = "";
    if (razonSocialRef.current) razonSocialRef.current.value = "";
    if (rutRef.current) rutRef.current.value = "";
    if (direccionRef.current) direccionRef.current.value = "";
    if (giroRef.current) giroRef.current.value = "";
    setPatentesAbierto(true);
    setPatentesTexto("");
    setUnCuponPorPatente(false);
    setTipoDoc("Boleta");
    setHayValor(false);
    setMetodoPago(null);
    setEstadoTransferencia(null);
  };

  return {
    valorTexto,
    setValorTexto,
    tipoDoc,
    setTipoDoc,
    hayValor,
    setHayValor,
    metodoPago,
    setMetodoPago,
    estadoTransferencia,
    setEstadoTransferencia,
    err,
    patentesAbierto,
    setPatentesAbierto,
    patentesTexto,
    setPatentesTexto,
    unCuponPorPatente,
    setUnCuponPorPatente,
    onRutBlur,
    generar,
  };
}
