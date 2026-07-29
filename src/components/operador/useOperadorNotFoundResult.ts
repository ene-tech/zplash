"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { finalizarClienteRapido, prepararClienteRapido, registrarIngresoInvitado } from "@/lib/logic";
import { esExentoValidacionRegistroOperador, fmtTelefono, formatRut, isValidRut, montoDescuento, normPlate, precioLavadoUnico, resolverDescuento } from "@/lib/helpers";
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
// nuevo (con o sin plan, con o sin Factura), ingreso como Invitado sin ficha,
// y la vista previa/aplicación de un código de descuento o cupón.
export function useOperadorNotFoundResult(
  plate: string,
  clearPlate: () => void,
  codigoDescuento: string | undefined,
  refs: NotFoundRefs
) {
  const { data, ui, commit, patchUi } = useApp();
  const { qNombreRef, qTelefonoRef, qEmailRef, qVehiculoRef, qRazonSocialRef, qRutRef, qDireccionRef, qGiroRef, qCuponRef } = refs;
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [tipoLavado, setTipoLavado] = useState<"plan" | "unico">("plan");
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
  // Lavado Full Túnel (ver quickAdd/ingresarSinRegistro), nunca a un plan.
  const precioBaseLavado = precioLavadoUnico(data.precios);
  const codigoTrim = codigoInput.trim();
  const resultadoDescuento = codigoTrim ? resolverDescuento(codigoTrim, normPlate(plate), data.cupones) : null;
  const cuponPrevio = resultadoDescuento?.ok ? resultadoDescuento.cupon : null;
  const precioConDescuento = cuponPrevio ? Math.max(0, precioBaseLavado - montoDescuento(cuponPrevio, precioBaseLavado)) : null;
  // Un descuento o cupón queda ligado a la identidad del cliente que lo usa
  // (auditoría/antifraude): con un código presente no se puede tomar el
  // atajo de "Invitado" sin datos, hay que completar el registro.
  const bloqueaInvitado = !!codigoTrim;

  const quickAdd = () => {
    const resultado = validarQuickAddCliente({
      nombreRaw: qNombreRef.current?.value || "",
      telefonoRaw: qTelefonoRef.current?.value || "",
      emailRaw: qEmailRef.current?.value || "",
      exentoValidacion,
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

  const ingresarSinRegistro = () => {
    if (qCuponRef.current?.value.trim()) {
      setErr("Con un código de descuento o cupón no se puede ingresar como invitado: completa el registro del cliente.");
      return;
    }
    const patente = normPlate(plate);
    const precio = precioLavadoUnico(data.precios);
    pedirPago(precio, `Lavado único sin registro (${patente})`, async (pago) => {
      const patch = registrarIngresoInvitado(data, { patente, precio, pago, perfilNombre: ui.perfilActual?.nombre });
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
    tipoLavado,
    setTipoLavado,
    err,
    setCodigoInput,
    precioBaseLavado,
    cuponPrevio,
    precioConDescuento,
    bloqueaInvitado,
    quickAdd,
    ingresarSinRegistro,
    onTelefonoBlur,
    onRutBlur,
  };
}
