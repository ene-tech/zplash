import type { TamanoVehiculo } from "@/types";

// Forma de la respuesta de /api/pagos/precios, compartida entre las pestañas
// del portal cliente (mismo endpoint público que ya usa /pagar).
export interface PreciosPublicos {
  plan: { nombre: string; precio: number };
  // Precio de contratar el plan por primera vez (ver precioContratacion) —
  // igual a `plan.precio` mientras no haya un valor de 1ra contratación
  // configurado. Solo se muestra donde se sabe que la patente es nueva.
  planPrimera: { nombre: string; precio: number };
  planOneclick: { nombre: string; precio: number };
  lavadoUnico: { nombre: string; precio: number };
  zonaAspirado: { nombre: string; precio: number };
  servicios: {
    id: string;
    nombre: string;
    categoria?: string;
    precio: number;
    // Presente solo si el servicio tiene precio diferenciado por tamaño de
    // vehículo (ver PreciosTamano) — hoy solo Lavado Completo Detailing.
    preciosTamano?: Record<TamanoVehiculo, number>;
  }[];
  // Pack de tickets de lavado (ver TicketsCard en Tipo de Lavados): cantidad
  // mínima y máxima comprable de una sola vez, el precio total de la mínima,
  // el precio unitario para calcular el total de cualquier cantidad, y los
  // días de vigencia configurados (ConfigGlobal.vigenciaDiasPackEmpresa).
  tickets: { cantidadMinima: number; cantidadMaxima: number; precioBase: number; precioUnitario: number; vigenciaDias: number };
  // Descuento de primera vez que ofrece el pop-up de bienvenida de la landing
  // (ver DescuentoBienvenidaModal). Viaja acá y no por un getConfig() aparte
  // porque getPreciosPublicos() ya lee la fila `config` para vigenciaDias:
  // así la landing entera se sirve de una sola lectura cacheada.
  descuentoBienvenida: { valor: number; diasValidez: number };
}
