"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { validarDisponibilidad } from "@/lib/agenda";
import {
  PATENTE_FORMATO_MSG,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  findClient,
  fmtCLP,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  normPlate,
  sumarMinutos,
  todayYMD,
  uid,
  uidVenta,
} from "@/lib/helpers";
import type { Cita, Cliente, Empresa, Venta } from "@/types";
import { useServicioSeleccion } from "./useServicioSeleccion";

const ERROR_GUARDADO = "No se pudo guardar el servicio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";
export const CATEGORIA_ADICIONALES = "Servicios Adicionales";
export const AJUSTES = [5000, 10000] as const;
// Duración a usar en la agenda cuando lo vendido no incluye ningún servicio
// del catálogo con duración propia (p. ej. solo un ítem personalizado).
const DURACION_DEFAULT_MINUTOS = 15;

// "abono50" quedó como nombre histórico del estado, pero ya no implica
// exactamente 50%: es cualquier abono parcial, siempre que cumpla el mínimo
// del 50% del total (ver montoAbonoMinimo). Se conserva el nombre porque así
// se guarda en ventas.estadoPago y no tiene equivalente cruzado con Cierre.
type EstadoPago = "pagado" | "abono50";

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
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
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
    if (lineas.length === 0) {
      setErr("Selecciona al menos un servicio");
      return;
    }
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    if (!nombre) {
      setErr("El nombre es obligatorio");
      return;
    }
    const telefonoValor = telefonoRef.current?.value.trim() || "";
    if (!telefonoValor) {
      setErr("El teléfono es obligatorio");
      return;
    }
    if (!isValidTelefono(telefonoValor)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    const emailValor = emailRef.current?.value.trim() || "";
    if (!emailValor) {
      setErr("El correo electrónico es obligatorio");
      return;
    }
    if (!isValidEmail(emailValor)) {
      setErr("El correo electrónico no es válido");
      return;
    }
    const vehiculoValor = vehiculoRef.current?.value.trim() || "";
    if (!vehiculoValor) {
      setErr("El vehículo es obligatorio");
      return;
    }
    if (!estadoPago) {
      setErr("Indica si el servicio está pagado 100% o con abono");
      return;
    }
    if (estadoPago === "abono50") {
      if (!montoAbono || montoAbono < montoAbonoMinimo) {
        setErr(`El abono debe ser como mínimo ${fmtCLP(montoAbonoMinimo)} (50% del total)`);
        return;
      }
      if (montoAbono > totalListado) {
        setErr("El abono no puede superar el total del servicio");
        return;
      }
    }
    if (!metodoPago) {
      setErr("Selecciona efectivo, tarjeta o transferencia");
      return;
    }
    if (horarioConfigurado && !horaCita) {
      setErr("Selecciona una hora de inicio para el servicio");
      return;
    }
    if (horaCita && horarioConfigurado) {
      const motivo = validarDisponibilidad(fechaCita, horaCita, duracionCita, data.horariosAgenda, data.bloqueosAgenda, citasDelDiaCita);
      if (motivo) {
        setErr(motivo);
        return;
      }
    }

    const telefono = formatTelefono(telefonoValor);
    const email = emailValor;
    const vehiculo = vehiculoValor;
    const razonSocial = tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDoc === "Factura" ? rutRef.current?.value.trim() || "" : "";
    const direccion = tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "";
    if (tipoDoc === "Factura") {
      if (!razonSocial || !direccion || !giro) {
        setErr("Completa Razón Social, Dirección y Giro para la factura");
        return;
      }
      if (!isValidRut(rutRaw)) {
        setErr(RUT_FORMATO_MSG);
        return;
      }
    }
    const rut = tipoDoc === "Factura" ? formatRut(rutRaw) : "";
    const horaEntrega = horaEntregaCampo || "";
    const fechaEntrega = horaEntregaCampo ? fechaEntregaCampo || fechaCita : "";
    const notas = notasRef.current?.value.trim() || "";

    setErr("");
    const patente = patenteBuscada;
    const existente = clienteExistente;

    let clientes = data.clientes;
    let clienteId: string;

    if (existente) {
      const actualizado: Cliente = {
        ...existente,
        nombre,
        telefono: telefono || existente.telefono,
        email: email || existente.email,
        vehiculo: vehiculo || existente.vehiculo,
        tipoDocumento: tipoDoc,
        razonSocial: tipoDoc === "Factura" ? razonSocial : existente.razonSocial,
        rut: tipoDoc === "Factura" ? rut : existente.rut,
        direccion: tipoDoc === "Factura" ? direccion : existente.direccion,
        giro: tipoDoc === "Factura" ? giro : existente.giro,
      };
      clientes = data.clientes.map((c) => (c.id === existente.id ? actualizado : c));
      clienteId = existente.id;
    } else {
      const nuevo: Cliente = {
        id: uid(),
        nombre,
        patente,
        telefono,
        email,
        vehiculo,
        tipoDocumento: tipoDoc,
        razonSocial,
        rut,
        direccion,
        giro,
        vencimiento: null,
        fechaContratacion: null,
        origen: "LOCAL",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
      clientes = [...data.clientes, nuevo];
      clienteId = nuevo.id;
    }

    // El RUT manda: si es Factura y ese RUT no pertenece a ninguna empresa ya
    // registrada, se crea una nueva en Empresas con este cliente como contacto.
    let nuevaEmpresa: Empresa | undefined;
    if (tipoDoc === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: clienteId,
        contactoNombre: nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
    }

    const ahora = new Date().toISOString();

    // Un lavado completo/detailing implica que el vehículo va a pasar por el
    // túnel, pero el registro en Historial de Ingresos (glosa "Limpieza
    // Completa") NO se crea acá: recién se genera cuando el operador registra
    // la patente en el módulo Operador al llegar el vehículo (ver
    // registrarIngresoDetailing en lib/actions.ts) — este alta solo deja la
    // Venta y la Cita agendadas.

    // La Agenda queda fusionada con la venta: el registro deja reservada su
    // hora en `citas`, con los servicios del catálogo elegidos ligados vía
    // cita_servicios (ver upsertCitas en dataAccess.ts) — equivalente a
    // cita_procedimientos en ConsultaPro, no un nombre concatenado en texto.
    // citaId se comparte con las ventas para poder mostrar/editar el Status
    // (circuito interno del vehículo) desde el log de Servicios registrados.
    // Se crea siempre, aunque no se haya elegido "Fecha y hora de Inicio"
    // (sin horario de atención configurado ese campo es opcional y casi
    // nunca se llena): todo vehículo que pasa por acá debe quedar trackeable
    // en el circuito, se haya agendado con hora o no.
    const citaId = uid();

    // Un vehículo = un registro: aunque se hayan elegido varios servicios,
    // se guarda UNA sola Venta con el precio total y el detalle de
    // servicios listado en `tipo` (cantidadItems guarda cuántos se
    // combinaron, para no perder esa métrica en Cierre de Caja).
    const ventaNueva: Venta = {
      id: uidVenta(),
      clienteId,
      patente,
      nombre,
      plan: "",
      precio: totalListado,
      tipo: lineas.map((l) => l.nombre).join(", "),
      fecha: ahora,
      creadoPor: ui.perfilActual?.nombre || "",
      metodoPago: metodoPago || undefined,
      horaEntrega: horaEntrega || undefined,
      fechaEntrega: fechaEntrega || undefined,
      citaId,
      cantidadItems: lineas.length,
      notas: notas || undefined,
      estadoPago,
      montoCobrado: montoCobradoTotal,
      esServicioAdicional: true,
    };

    const citaNueva: Cita = {
      id: citaId,
      clienteId,
      servicioIds: serviciosSeleccionados,
      patente,
      nombre,
      telefono: telefono || undefined,
      fechaHora: horaCita ? `${fechaCita}T${horaCita}:00` : ahora,
      duracionMinutos: duracionCita,
      estado: "agendado",
      notas: notas || undefined,
      origen: "interno",
      creadoPor: ui.perfilActual?.nombre || "",
      creadoEn: ahora,
    };

    const ok = await commit({
      clientes,
      ventas: [ventaNueva, ...data.ventas],
      ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
      citas: [citaNueva, ...data.citas],
    });
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
