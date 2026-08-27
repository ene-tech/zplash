export interface Cupon {
  id: string;
  codigo: string;
  nombreLote: string;
  valor: number;
  numeroLote: number;
  totalLote: number;
  fechaCaducidad: string;
  usado: boolean;
  patenteUso?: string;
  fechaUso?: string;
  operadorUso?: string;
  creadoEn: string;
  creadoPor?: string;
  // "vale" (lavado 100% gratis al canjear, comportamiento original) vs
  // "descuento" (resta del precio a cobrar; generado por el bot de WhatsApp
  // para clientes nuevos, o manualmente desde B2B/Tickets/Dsctos).
  tipo: "vale" | "descuento";
  // Solo aplica a "descuento": si es true, `valor` es un porcentaje (0-100)
  // a aplicar sobre el precio base; si es false, `valor` es un monto fijo en CLP.
  esPorcentaje?: boolean;
  // Patente a la que se le asignó el cupón antes de usarse. Solo aplica a
  // "descuento" — distinto de patenteUso, que se llena recién al canjear.
  // Si no tiene patente asignada, el descuento es "abierto" (cualquier patente).
  patenteAsignada?: string;
  // RUT de la empresa dueña del lote (packs empresa por web o generados
  // manualmente en B2B/Tickets con Factura) — permite la consulta pública de
  // tickets por RUT en /api/empresa/tickets.
  rut?: string;
  // Solo aplica a tipo "vale" de un pack empresa: patentes de la flota
  // autorizadas a canjear cualquiera de los tickets del lote. Vacío/undefined
  // = lote abierto, cualquier patente puede canjear.
  patentesAutorizadas?: string[];
  // Regla opcional del lote (packs de cortesía / eventos publicitarios): cada
  // patente puede canjear un solo cupón del lote, para que la promoción
  // llegue a clientes distintos. Vacío/false = sin la regla, la misma patente
  // puede canjear varios cupones del lote (comportamiento original).
  unCuponPorPatente?: boolean;
  // Solo aplica a "descuento": el código NO muere en el primer canje — cada
  // patente puede usarlo una vez y sigue vigente hasta caducar. Para promos
  // abiertas que circulan públicas (redes sociales, volantes). Vacío/false =
  // un solo uso global, el comportamiento original (`usado`).
  unUsoPorPatente?: boolean;
  // Patentes que ya canjearon un descuento con unUsoPorPatente. Reemplaza a
  // usado/patenteUso en ese modo: un código reutilizable no tiene UNA patente
  // de uso. Ver descuentoGastadoPor / marcarDescuentoUsado.
  patentesUsadas?: string[];
  // Solo aplica a "descuento": lo puede usar únicamente una patente sin ficha
  // de cliente (misma definición de "nuevo" que /api/cliente/descuento-bienvenida).
  soloClientesNuevos?: boolean;
  // Email de quien compró el Pack Empresa por web — permite mostrar los
  // tickets en Mi Cuenta (portal cliente) buscando por el correo de la
  // sesión. Undefined en cupones generados a mano o sin email.
  email?: string;
}
