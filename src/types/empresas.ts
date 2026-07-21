// Empresas de compra y venta para emitir/recibir facturas. contactoClienteId
// referencia (informativamente, sin FK estricta, mismo criterio que
// ingresos/ventas.clienteId) a un cliente de la tabla clientes; contactoNombre
// queda denormalizado para no perder el dato si ese cliente se elimina.
export interface Empresa {
  id: string;
  razonSocial: string;
  rut: string;
  giro?: string;
  direccion?: string;
  telefono?: string;
  contactoClienteId?: string;
  contactoNombre?: string;
  creadoEn: string;
  creadoPor?: string;
}
