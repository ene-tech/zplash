"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { registrarIngreso } from "@/lib/actions";
import {
  PLANES,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  esExentoValidacionRegistroOperador,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidRut,
  isValidTelefono,
  montoDescuento,
  normPlate,
  precioLavadoUnico,
  precioNormal,
  resolverDescuento,
  uid,
} from "@/lib/helpers";
import type { Cliente, Cupon, Empresa, Ingreso, PagoInfo, Venta } from "@/types";

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

  const pedirPago = (monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
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
    const nombre = (qNombreRef.current?.value.trim() || "").toUpperCase();
    const telefonoRaw = qTelefonoRef.current?.value.trim() || "";
    const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
    const email = qEmailRef.current?.value.trim() || "";
    const vehiculo = qVehiculoRef.current?.value.trim() || "";
    if (!nombre || (!exentoValidacion && (!telefonoRaw || !email))) {
      setErr("Completa Nombre, Teléfono y Correo electrónico para registrar al cliente");
      return;
    }
    if (!exentoValidacion && !isValidTelefono(telefono)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    if (!exentoValidacion && !isValidEmail(email)) {
      setErr("Ingresa un email válido");
      return;
    }
    const tipoCliente = tipoLavado;
    const plan = PLANES[0];
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? qRazonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDocumento === "Factura" ? qRutRef.current?.value.trim() || "" : "";
    const direccion = tipoDocumento === "Factura" ? qDireccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? qGiroRef.current?.value.trim() || "" : "";
    if (tipoDocumento === "Factura") {
      if (!email || !isValidEmail(email)) {
        setErr("Ingresa un email válido para la factura");
        return;
      }
      if (!razonSocial || !direccion || !giro) {
        setErr("Completa Razón Social, Dirección y Giro para la factura");
        return;
      }
      if (!isValidRut(rutRaw)) {
        setErr(RUT_FORMATO_MSG);
        return;
      }
    }
    const rut = tipoDocumento === "Factura" ? formatRut(rutRaw) : "";
    let vencimiento: string | null = null;
    if (tipoCliente === "plan") {
      const venc = new Date();
      venc.setDate(venc.getDate() + 30);
      vencimiento = venc.toISOString();
    }
    const nuevo: Cliente = {
      id: uid(),
      nombre,
      telefono,
      email,
      vehiculo,
      patente: normPlate(plate),
      plan: tipoCliente === "plan" ? plan : "",
      tipoDocumento,
      razonSocial,
      rut,
      direccion,
      giro,
      vencimiento,
      origen: "LOCAL",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || "",
    };
    const precioBase = tipoCliente === "plan" ? precioNormal(data.precios, plan) : precioLavadoUnico(data.precios);
    let precio = precioBase;
    let cuponAplicado: Cupon | undefined;
    if (tipoCliente === "unico") {
      const codigoCupon = qCuponRef.current?.value.trim() || "";
      if (codigoCupon) {
        const resultado = resolverDescuento(codigoCupon, nuevo.patente, data.cupones);
        if (!resultado.ok) {
          setErr(resultado.msg);
          return;
        }
        cuponAplicado = resultado.cupon;
        precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
      }
    }
    const tipoVenta = tipoCliente === "plan" ? "Plan nuevo" : "Lavado único";
    const descripcion = tipoCliente === "plan" ? `Contratación de plan para ${nombre}` : `Lavado único para ${nombre}`;

    // Si es Factura y el RUT no pertenece a ninguna empresa ya registrada, se
    // crea una nueva en Empresas con este cliente como persona de contacto.
    let nuevaEmpresa: Empresa | undefined;
    if (tipoDocumento === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: nuevo.id,
        contactoNombre: nuevo.nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
    }

    pedirPago(precio, descripcion, async (pago) => {
      const ahora = new Date().toISOString();
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: nuevo.id,
        patente: nuevo.patente,
        nombre: nuevo.nombre,
        plan: nuevo.plan || "",
        precio,
        tipo: tipoVenta,
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        viaCupon: !!cuponAplicado,
        cuponCodigo: cuponAplicado?.codigo,
      };
      const tempData = { ...data, clientes: [...data.clientes, nuevo], ventas: [venta, ...data.ventas] };
      const ingresoPatch = registrarIngreso(tempData, nuevo, ui.perfilActual?.nombre);
      const ok = await commit({
        clientes: ingresoPatch.clientes,
        ventas: tempData.ventas,
        ingresos: ingresoPatch.ingresos,
        ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
        ...(cuponAplicado
          ? {
              cupones: data.cupones.map((x) =>
                x.id === cuponAplicado!.id
                  ? { ...cuponAplicado!, usado: true, patenteUso: nuevo.patente, fechaUso: ahora, operadorUso: ui.perfilActual?.nombre || "" }
                  : x
              ),
            }
          : {}),
      });
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
      const ahora = new Date().toISOString();
      // No queda "sin registro" de verdad: se crea una ficha de Cliente
      // identificada como "Invitado" para esa patente, así el próximo
      // ingreso la encuentra por findClient() y queda historial de
      // visitas/frecuencia de ese vehículo aunque nunca haya dado sus datos.
      const invitado: Cliente = {
        id: uid(),
        nombre: "Invitado",
        patente,
        plan: "",
        vencimiento: null,
        origen: "LOCAL",
        visitas: 1,
        ultimaVisita: ahora,
        creadoEn: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
      };
      const ingreso: Ingreso = {
        id: "i" + Date.now(),
        clienteId: invitado.id,
        patente,
        nombre: invitado.nombre,
        fecha: ahora,
        planEstadoAlIngreso: "bad",
        creadoPor: ui.perfilActual?.nombre || "",
      };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: invitado.id,
        patente,
        nombre: invitado.nombre,
        plan: "",
        precio,
        tipo: "Lavado único",
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: [...data.clientes, invitado],
        ingresos: [ingreso, ...data.ingresos],
        ventas: [venta, ...data.ventas],
      });
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
