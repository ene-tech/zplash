import { formatRut, uid, uidVenta } from "@/lib/helpers";
import type { AppData, Cita, Cliente, Empresa, Venta } from "@/types";

export interface DatosServicioAdicional {
  existente: Cliente | null;
  patente: string;
  nombre: string;
  telefono: string;
  email: string;
  vehiculo: string;
  tipoDoc: "Boleta" | "Factura";
  razonSocial: string;
  rut: string;
  direccion: string;
  giro: string;
  notas: string;
  horaEntrega: string;
  fechaEntrega: string;
  lineas: { nombre: string }[];
  serviciosSeleccionados: string[];
  totalListado: number;
  metodoPago: "efectivo" | "tarjeta" | "transferencia";
  estadoPago: "pagado" | "abono50";
  montoCobradoTotal: number;
  horaCita: string;
  fechaCita: string;
  duracionCita: number;
  creadoPor: string;
}

/**
 * Registra un servicio adicional ya validado (ver
 * validarRegistroServicioAdicional en @/components/servicios): da de
 * alta o actualiza el Cliente, crea la Empresa si corresponde (Factura con un
 * RUT nuevo), y deja la Venta + Cita agendadas. Un lavado completo/detailing
 * implica que el vehículo va a pasar por el túnel, pero el registro en
 * Historial de Ingresos (glosa "Limpieza Completa") NO se crea acá: recién se
 * genera cuando el operador registra la patente en el módulo Operador al
 * llegar el vehículo (ver registrarIngresoDetailing en este mismo archivo de
 * @/lib/logic) — este alta solo deja la Venta y la Cita agendadas.
 */
export function registrarServicioAdicional(data: AppData, d: DatosServicioAdicional): Partial<AppData> {
  let clientes = data.clientes;
  let clienteId: string;

  if (d.existente) {
    const actualizado: Cliente = {
      ...d.existente,
      nombre: d.nombre,
      telefono: d.telefono || d.existente.telefono,
      email: d.email || d.existente.email,
      vehiculo: d.vehiculo || d.existente.vehiculo,
      tipoDocumento: d.tipoDoc,
      razonSocial: d.tipoDoc === "Factura" ? d.razonSocial : d.existente.razonSocial,
      rut: d.tipoDoc === "Factura" ? d.rut : d.existente.rut,
      direccion: d.tipoDoc === "Factura" ? d.direccion : d.existente.direccion,
      giro: d.tipoDoc === "Factura" ? d.giro : d.existente.giro,
    };
    const existenteId = d.existente.id;
    clientes = data.clientes.map((c) => (c.id === existenteId ? actualizado : c));
    clienteId = existenteId;
  } else {
    const nuevo: Cliente = {
      id: uid(),
      nombre: d.nombre,
      patente: d.patente,
      telefono: d.telefono,
      email: d.email,
      vehiculo: d.vehiculo,
      tipoDocumento: d.tipoDoc,
      razonSocial: d.razonSocial,
      rut: d.rut,
      direccion: d.direccion,
      giro: d.giro,
      vencimiento: null,
      fechaContratacion: null,
      origen: "LOCAL",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor: d.creadoPor,
    };
    clientes = [...data.clientes, nuevo];
    clienteId = nuevo.id;
  }

  // El RUT manda: si es Factura y ese RUT no pertenece a ninguna empresa ya
  // registrada, se crea una nueva en Empresas con este cliente como contacto.
  let nuevaEmpresa: Empresa | undefined;
  if (d.tipoDoc === "Factura" && d.rut && !data.empresas.some((e) => formatRut(e.rut) === d.rut)) {
    nuevaEmpresa = {
      id: uid(),
      razonSocial: d.razonSocial,
      rut: d.rut,
      giro: d.giro,
      direccion: d.direccion,
      telefono: d.telefono,
      contactoClienteId: clienteId,
      contactoNombre: d.nombre,
      creadoEn: new Date().toISOString(),
      creadoPor: d.creadoPor,
    };
  }

  const ahora = new Date().toISOString();

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
    patente: d.patente,
    nombre: d.nombre,
    plan: "",
    precio: d.totalListado,
    tipo: d.lineas.map((l) => l.nombre).join(", "),
    fecha: ahora,
    creadoPor: d.creadoPor,
    metodoPago: d.metodoPago,
    horaEntrega: d.horaEntrega || undefined,
    fechaEntrega: d.fechaEntrega || undefined,
    citaId,
    cantidadItems: d.lineas.length,
    notas: d.notas || undefined,
    estadoPago: d.estadoPago,
    montoCobrado: d.montoCobradoTotal,
    esServicioAdicional: true,
  };

  const citaNueva: Cita = {
    id: citaId,
    clienteId,
    servicioIds: d.serviciosSeleccionados,
    patente: d.patente,
    nombre: d.nombre,
    telefono: d.telefono || undefined,
    fechaHora: d.horaCita ? `${d.fechaCita}T${d.horaCita}:00` : ahora,
    duracionMinutos: d.duracionCita,
    estado: "agendado",
    notas: d.notas || undefined,
    origen: "interno",
    creadoPor: d.creadoPor,
    creadoEn: ahora,
  };

  return {
    clientes,
    ventas: [ventaNueva, ...data.ventas],
    ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    citas: [citaNueva, ...data.citas],
  };
}
