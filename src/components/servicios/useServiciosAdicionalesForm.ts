"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import {
  PATENTE_FORMATO_MSG,
  findClient,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidPatente,
  isValidRut,
  normPlate,
  sumarMinutos,
  todayYMD,
} from "@/lib/helpers";
import { registrarServicioAdicional } from "@/lib/logic";
import {
  validarRegistroServicioAdicional,
  type EstadoPagoServicioAdicional as EstadoPago,
  type MetodoPagoServicioAdicional,
} from "./validarRegistroServicioAdicional";
import { useServicioSeleccion } from "./useServicioSeleccion";

const ERROR_GUARDADO = "No se pudo guardar el servicio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";
export const CATEGORIA_ADICIONALES = "Servicios Adicionales";
export const AJUSTES = [5000, 10000] as const;
// Duración a usar en la agenda cuando lo vendido no incluye ningún servicio
// del catálogo con duración propia (p. ej. solo un ítem personalizado).
const DURACION_DEFAULT_MINUTOS = 15;

type FormRefs = {
  patenteRef: RefObject<HTMLInputElement | null>;
  nombreRef: RefObject<HTMLInputElement | null>;
  telefonoRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
  vehiculoRef: RefObject<HTMLInputElement | null>;
  razonSocialRef: RefObject<HTMLInputElement | null>;
  rutRef: RefObject<HTMLInputElement | null>;
  direccionRef: RefObject<HTMLInputElement | null>;
  giroRef: RefObject<HTMLInputElement | null>;
  notasRef: RefObject<HTMLTextAreaElement | null>;
  detallePersonalizadoRef: RefObject<HTMLInputElement | null>;
};

// Toda la lógica del formulario de "Registrar servicio adicional": búsqueda
// de patente, fecha/hora de Inicio y Entrega (con auto-cálculo de Entrega
// salvo edición manual), estado y forma de pago, y el registro final
// (Cliente + Venta + Cita en un solo commit). La selección de servicios del
// catálogo vive en useServicioSeleccion (dominio propio).
export function useServiciosAdicionalesForm(refs: FormRefs) {
  const { data, ui, commit } = useApp();
  const {
    patenteRef,
    nombreRef,
    telefonoRef,
    emailRef,
    vehiculoRef,
    razonSocialRef,
    rutRef,
    direccionRef,
    giroRef,
    notasRef,
    detallePersonalizadoRef,
  } = refs;
  const [err, setErr] = useState("");
  const seleccion = useServicioSeleccion(detallePersonalizadoRef, setErr);
  const { lineas, totalListado, serviciosSeleccionados } = seleccion;

  const [montoAbonoTexto, setMontoAbonoTexto] = useState("");
  const [patenteBuscada, setPatenteBuscada] = useState<string | null>(null);
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [estadoPago, setEstadoPago] = useState<EstadoPago | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPagoServicioAdicional | null>(null);
  const [fechaCita, setFechaCita] = useState(todayYMD());
  const [horaCita, setHoraCita] = useState("");
  const [fechaEntregaManual, setFechaEntregaManual] = useState("");
  const [horaEntregaManual, setHoraEntregaManual] = useState("");
  // Mientras el operador no toque la Entrega a mano, se recalcula sola como
  // hora de Inicio + suma de duraciones de los servicios elegidos. En cuanto
  // la edita directamente dejamos de pisarla, aunque cambien los servicios.
  const [entregaEditadaManualmente, setEntregaEditadaManualmente] = useState(false);

  const clienteExistente = patenteBuscada ? findClient(data.clientes, patenteBuscada) || null : null;
  // Mínimo exigido para registrar el servicio con abono: 50% del total,
  // redondeado hacia arriba para no permitir que un total impar quede por
  // debajo de la mitad real (ej. total 1999 → mínimo 1000, no 999).
  const montoAbonoMinimo = Math.ceil(totalListado / 2);
  const montoAbono = Number(montoAbonoTexto || "0");
  const montoCobradoTotal = estadoPago === "pagado" ? totalListado : estadoPago === "abono50" ? montoAbono : 0;

  // La Agenda queda alimentada por este mismo registro: la duración de la
  // cita es la suma de las duraciones del catálogo elegido (equivalente a
  // "procedimientos" en ConsultaPro), con un mínimo por si solo se
  // vendieron ítems personalizados (sin duración propia).
  const duracionCatalogoTotal = serviciosSeleccionados.reduce(
    (sum, id) => sum + (seleccion.catalogo.find((s) => s.id === id)?.duracionMinutos || 0),
    0
  );
  const duracionCita = lineas.length > 0 ? duracionCatalogoTotal || DURACION_DEFAULT_MINUTOS : 0;
  const horarioConfigurado = data.horariosAgenda.length > 0;
  const citasDelDiaCita = data.citas.filter((c) => c.fechaHora.slice(0, 10) === fechaCita);

  // Entrega sugerida = Inicio + duración de lo seleccionado. Se recalcula sola
  // hasta que el operador edite el campo de Entrega directamente.
  const entregaSugerida = horaCita ? sumarMinutos(fechaCita, horaCita, duracionCita) : { fecha: "", hora: "" };
  const fechaEntregaCampo = entregaEditadaManualmente ? fechaEntregaManual : entregaSugerida.fecha;
  const horaEntregaCampo = entregaEditadaManualmente ? horaEntregaManual : entregaSugerida.hora;

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos en vez de tipearlos de nuevo.
  // Si no existe, registrar() la crea con este cliente como contacto.
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

  const onTelefonoBlur = () => {
    const raw = telefonoRef.current?.value.trim() || "";
    if (!raw || !telefonoRef.current) return;
    telefonoRef.current.value = fmtTelefono(raw);
  };

  const resetFormulario = () => {
    seleccion.resetSeleccion();
    setEstadoPago(null);
    setMontoAbonoTexto("");
    setMetodoPago(null);
    setFechaCita(todayYMD());
    setHoraCita("");
    setFechaEntregaManual("");
    setHoraEntregaManual("");
    setEntregaEditadaManualmente(false);
  };

  const buscarPatente = () => {
    const patente = normPlate(patenteRef.current?.value || "");
    if (!patente) {
      setErr("Ingresa una patente");
      return;
    }
    if (!isValidPatente(patente)) {
      setErr(PATENTE_FORMATO_MSG);
      return;
    }
    setErr("");
    const cliente = findClient(data.clientes, patente);
    setPatenteBuscada(patente);
    setTipoDoc(cliente?.tipoDocumento === "Factura" ? "Factura" : "Boleta");
    resetFormulario();
  };

  const cambiarPatente = () => {
    setPatenteBuscada(null);
    resetFormulario();
    setErr("");
  };

  const registrar = async () => {
    if (!patenteBuscada) return;
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    const telefonoValor = telefonoRef.current?.value.trim() || "";
    const emailValor = emailRef.current?.value.trim() || "";
    const vehiculoValor = vehiculoRef.current?.value.trim() || "";
    const razonSocialValor = tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRawValor = tipoDoc === "Factura" ? rutRef.current?.value.trim() || "" : "";
    const direccionValor = tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giroValor = tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "";

    const resultado = validarRegistroServicioAdicional({
      lineasCount: lineas.length,
      nombre,
      telefonoValor,
      emailValor,
      vehiculoValor,
      estadoPago,
      montoAbono,
      montoAbonoMinimo,
      totalListado,
      metodoPago,
      horarioConfigurado,
      horaCita,
      fechaCita,
      duracionCita,
      horariosAgenda: data.horariosAgenda,
      bloqueosAgenda: data.bloqueosAgenda,
      citasDelDiaCita,
      tipoDoc,
      razonSocialValor,
      rutRawValor,
      direccionValor,
      giroValor,
    });
    if (!resultado.ok) {
      setErr(resultado.error);
      return;
    }

    setErr("");
    const notas = notasRef.current?.value.trim() || "";

    const patch = registrarServicioAdicional(data, {
      existente: clienteExistente,
      patente: patenteBuscada,
      nombre,
      telefono: formatTelefono(telefonoValor),
      email: emailValor,
      vehiculo: vehiculoValor,
      tipoDoc,
      razonSocial: razonSocialValor,
      rut: resultado.rut,
      direccion: direccionValor,
      giro: giroValor,
      notas,
      horaEntrega: horaEntregaCampo || "",
      fechaEntrega: horaEntregaCampo ? fechaEntregaCampo || fechaCita : "",
      lineas,
      serviciosSeleccionados,
      totalListado,
      // ya validados no-null por validarRegistroServicioAdicional arriba
      metodoPago: metodoPago!,
      estadoPago: estadoPago!,
      montoCobradoTotal,
      horaCita,
      fechaCita,
      duracionCita,
      creadoPor: ui.perfilActual?.nombre || "",
    });

    const ok = await commit(patch);
    if (!ok) {
      setErr(ERROR_GUARDADO);
      return;
    }
    if (patenteRef.current) patenteRef.current.value = "";
    setPatenteBuscada(null);
    setTipoDoc("Boleta");
    resetFormulario();
  };

  return {
    data,
    err,
    setErr,
    clienteExistente,
    seleccion,
    montoAbonoMinimo,
    montoAbonoTexto,
    setMontoAbonoTexto,
    montoCobradoTotal,
    patenteBuscada,
    tipoDoc,
    setTipoDoc,
    estadoPago,
    setEstadoPago,
    metodoPago,
    setMetodoPago,
    fechaCita,
    setFechaCita,
    horaCita,
    setHoraCita,
    fechaEntregaCampo,
    horaEntregaCampo,
    setFechaEntregaManual,
    setHoraEntregaManual,
    setEntregaEditadaManualmente,
    entregaEditadaManualmente,
    duracionCita,
    horarioConfigurado,
    buscarPatente,
    cambiarPatente,
    registrar,
    onRutBlur,
    onTelefonoBlur,
  };
}
