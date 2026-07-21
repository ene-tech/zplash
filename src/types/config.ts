// Bloqueo horario del módulo Operador (registro de ingresos): fuera de estos
// rangos, solo perfiles exentos (ver esExentoHorarioOperador en helpers.ts —
// hoy equivale a "tiene acceso a Configuración", es decir Administración y
// Gerencia) pueden registrar el ingreso de un vehículo. festivos es una lista
// de fechas YYYY-MM-DD que se tratan con el horario de fin de semana.
// Un tramo de la escala de renovación preferencial por visitas (ver
// tramosRenovacionLocal en ConfigGlobal): visitasMax null = sin tope superior
// (último tramo abierto, ej. "5 o más visitas").
export interface TramoRenovacionLocal {
  id: string;
  visitasMin: number;
  visitasMax: number | null;
  precio: number;
}

export interface ConfigGlobal {
  horarioOperadorSemanaInicio: string;
  horarioOperadorSemanaFin: string;
  horarioOperadorFindeInicio: string;
  horarioOperadorFindeFin: string;
  festivos: string[];
  // Días de vigencia de los tickets de un Pack Empresa (ver PACKS_EMPRESA en
  // helpers.ts), editable en Web Settings — a propósito no amarrado a los 90
  // días fijos de otros productos.
  vigenciaDiasPackEmpresa: number;
  // Escala de precio de renovación preferencial para clientes Local (origen
  // distinto de "WEB") según su cantidad de visitas acumuladas
  // (Cliente.visitas), keyed por plan (mismo patrón que Precios) — permite
  // ofrecer, por ejemplo, un precio más bajo a quien pasó 0 o 1 vez que a un
  // cliente frecuente. Si un cliente no cae en ningún tramo, se usa el precio
  // preferencial general (Precios[plan].promo, ver precioRenovacionLocal).
  tramosRenovacionLocal: Record<string, TramoRenovacionLocal[]>;
}
