// Tablas cubiertas por el log de auditoría (las que mueven dinero o datos de
// clientes). Perfiles/precios/categoriasGasto/config quedan fuera a
// propósito: bajo riesgo/volumen, ver evaluación en supabase/add-auditoria.sql.
export type TablaAuditada = "clientes" | "ingresos" | "ventas" | "empresas" | "cupones" | "movimientos_contables" | "citas";

// Una entrada del log de auditoría. Es de solo escritura desde la app (no
// se carga a AppData/memoria, se revisa directo en Supabase); se genera y
// envía desde commit() en AppContext.tsx. datosAnteriores/datosNuevos son
// el snapshot completo de la fila en su forma de la app (camelCase), no la
// fila cruda de la base de datos.
export interface AuditoriaEntrada {
  tabla: TablaAuditada;
  registroId: string;
  accion: "insert" | "update" | "delete";
  datosAnteriores: unknown | null;
  datosNuevos: unknown | null;
  usuario: string | null;
}
