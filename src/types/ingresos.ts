export interface Ingreso {
  id: string;
  clienteId: string;
  patente: string;
  nombre: string;
  fecha: string;
  planEstadoAlIngreso: "ok" | "warn" | "bad";
  creadoPor?: string;
  esGarantia?: boolean;
  viaCupon?: boolean;
  cuponCodigo?: string;
  glosa?: string;
  // Liga este ingreso a la Cita de la venta que lo originó (ver
  // registrarIngresoDetailing en lib/actions.ts): un lavado completo/
  // detailing se vende en Servicios Adicionales, pero el Ingreso recién se
  // crea al registrar la patente en el módulo Operador, sin generar una
  // venta nueva.
  citaId?: string;
}
