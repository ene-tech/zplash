// Lógica de commit() de AppContext.tsx, dividida por dominio de negocio: cada
// commitX() recibe el estado previo y el patch de esa sola entidad y devuelve
// las Server Actions ya disparadas (`ops`) más las entradas de auditoría
// (`auditoria`) a insertar si el guardado resulta ok — nunca toca React
// (useState/useRef), eso sigue siendo responsabilidad exclusiva de commit()
// en AppContext.tsx, que es quien arma `ops`/`auditoria` completos, decide si
// hacer rollback y actualiza el estado del Provider.

export * from "./agenda";
export * from "./clientes";
export * from "./config";
export * from "./contabilidad";
export * from "./cupones";
export * from "./empresas";
export * from "./funcionario";
export * from "./ingresos";
export * from "./inventario";
export * from "./mail";
export * from "./mantencion";
export * from "./perfiles";
export * from "./precios";
export * from "./servicios";
export * from "./shared";
export * from "./ventas";
export * from "./whatsapp";
