"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { finalizarClienteRapido, prepararClienteRapido } from "@/lib/logic";
import {
  esExentoValidacionRegistroOperador,
  fmtTelefono,
  formatRut,
  isValidRut,
  montoDescuento,
  normPlate,
  precioLavadoUnico,
  precioPlanOneclick,
  precioPromoLavados,
  resolverDescuento,
} from "@/lib/helpers";
import type { PagoInfo } from "@/types";
import { validarQuickAddCliente } from "./validarQuickAdd";

const ERROR_GUARDADO = "No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";

type NotFoundRefs = {
  qNombreRef: RefObject<HTMLInputElement | null>;
  qTelefonoRef: RefObject<HTMLInputElement | null>;
  qEmailRef: RefObject<HTMLInputElement | null>;
  qVehiculoRef: RefObject<HTMLInputElement | null>;
  qRazonSocialRef: RefObject<HTMLInputElement | null>;
  qRutRef: RefObject<HTMLInputElement | null>;
  qDireccionRef: RefObject<HTMLInputElement | null>;
  qGiroRef: RefObject<HTMLInputElement | null>;
  qCuponRef: RefObject<HTMLInputElement | null>;
};

// Lógica del resultado "patente no registrada": registro rápido de cliente
// nuevo (con o sin plan, con o sin Factura) y la vista previa/aplicación de
// un código de descuento o cupón.
export function useOperadorNotFoundResult(
  plate: string,
  clearPlate: () => void,
  codigoDescuento: string | undefined,
  refs: NotFoundRefs
) {
  const { data, ui, commit, patchUi } = useApp();
  const { qNombreRef, qTelefonoRef, qEmailRef, qVehiculoRef, qRazonSocialRef, qRutRef, qDireccionRef, qGiroRef, qCuponRef } = refs;
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  // Salida honesta cuando el cliente no quiere dar el correo: sin esto el
  // operador inventa uno para poder guardar (ver esCorreoDeRelleno).
  const [sinCorreo, setSinCorreo] = useState(false);
  // "plan" no registra nada acá: el Plan X5 se vende solo por la web, así que
  // muestra el QR para que el cliente lo pague en su celular (ver
  // OperadorNotFoundResult).
  const [tipoLavado, setTipoLavado] = useState<"plan" | "unico" | "promo2" | "promo5">("unico");
  const [err, setErr] = useState("");
  const [codigoInput, setCodigoInput] = useState(codigoDescuento || "");

  // Si el precio con descuento/cupón queda en $0, no corresponde pedir método
  // de pago (el cliente no está pagando nada) — mismo criterio que en
  // useIngresoActions.cobrarLavadoUnico y usePlanActions.
  const pedirPago = (monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
    if (monto <= 0) {
      onConfirm({ metodo: undefined });
      return;
    }
    patchUi({ modal: { type: "pago", monto, descripcion, onConfirm } });
  };

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos (Razón Social, Dirección,
  // Giro) en vez de tipearlos de nuevo. Si no existe, quickAdd() la crea al
  // guardar, con este cliente nuevo como persona de contacto.
  const onTelefonoBlur = () => {
    const raw = qTelefonoRef.current?.value.trim() || "";
    if (!raw || !qTelefonoRef.current) return;
    qTelefonoRef.current.value = fmtTelefono(raw);
  };

  const onRutBlur = () => {
    const rutRaw = qRutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (qRutRef.current) qRutRef.current.value = rutFormateado;
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rutFormateado);
    if (!empresa) return;
    if (qRazonSocialRef.current) qRazonSocialRef.current.value = empresa.razonSocial;
    if (qDireccionRef.current) qDireccionRef.current.value = empresa.direccion || "";
    if (qGiroRef.current) qGiroRef.current.value = empresa.giro || "";
  };

  const exentoValidacion = esExentoValidacionRegistroOperador(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);

  // Vista previa del beneficio mientras se tipea el código: solo aplica al
  // Lavado Full Túnel (ver quickAdd), nunca a un plan.
  const precioBaseLavado = precioLavadoUnico(data.precios);
  const codigoTrim = codigoInput.trim();
  const resultadoDescuento = codigoTrim ? resolverDescuento(codigoTrim, normPlate(plate), data.cupones, data.clientes) : null;
  const cuponPrevio = resultadoDescuento?.ok ? resultadoDescuento.cupon : null;
  const precioConDescuento = cuponPrevio ? Math.max(0, precioBaseLavado - montoDescuento(cuponPrevio, precioBaseLavado)) : null;

  const quickAdd = () => {
    if (tipoLavado === "plan") return;
    const resultado = validarQuickAddCliente({
      nombreRaw: qNombreRef.current?.value || "",
      telefonoRaw: qTelefonoRef.current?.value || "",
      emailRaw: qEmailRef.current?.value || "",
      sinCorreo,
      exentoValidacion,
      tipoCliente: tipoLavado,
      tipoDocumento: tipoDoc,
      razonSocialRaw: qRazonSocialRef.current?.value || "",
      rutRaw: qRutRef.current?.value || "",
      direccionRaw: qDireccionRef.current?.value || "",
      giroRaw: qGiroRef.current?.value || "",
    });
    if (!resultado.ok) {
      setErr(resultado.error);
      return;
    }

    const preparado = prepararClienteRapido(data, {
      patente: normPlate(plate),
      nombre: resultado.nombre,
      telefono: resultado.telefono,
      email: resultado.email,
      vehiculo: qVehiculoRef.current?.value.trim() || "",
      tipoDocumento: tipoDoc,
      razonSocial: resultado.razonSocial,
      rut: resultado.rut,
      direccion: resultado.direccion,
      giro: resultado.giro,
      tipoCliente: tipoLavado,
      codigoCupon: tipoLavado === "unico" ? qCuponRef.current?.value.trim() || "" : "",
      perfilNombre: ui.perfilActual?.nombre,
    });
    if (!preparado.ok) {
      setErr(preparado.error);
      return;
    }

    pedirPago(preparado.precio, preparado.descripcion, async (pago) => {
      const patch = finalizarClienteRapido(data, preparado, pago, ui.perfilActual?.nombre);
      const ok = await commit(patch);
      if (!ok) {
        setErr(ERROR_GUARDADO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    });
  };

  return {
    tipoDoc,
    setTipoDoc,
    sinCorreo,
    setSinCorreo,
    tipoLavado,
    setTipoLavado,
    err,
    setCodigoInput,
    precioBaseLavado,
    // Lo que /pagar le cobra a una patente sin cliente (ver /api/pagos/estado).
    precioPlanWeb: precioPlanOneclick(data.precios),
    perfilId: ui.perfilActual?.id,
    // $0 = pack apagado, su botón no se muestra (ver precioPromoLavados).
    precioPromo2: precioPromoLavados(data.precios, "promo_2_lavados"),
    precioPromo5: precioPromoLavados(data.precios, "promo_5_lavados"),
    cuponPrevio,
    precioConDescuento,
    quickAdd,
    onTelefonoBlur,
    onRutBlur,
  };
}
