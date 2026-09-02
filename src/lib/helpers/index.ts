// Funciones y constantes de negocio sin estado, divididas por responsabilidad
// (a diferencia de dataAccess/db/types, que se dividen por entidad: acá el
// eje es "qué tipo de cosa hace" — fechas, validadores, precios, ids — porque
// eran justamente las responsabilidades mezcladas sin ningún criterio las que
// habían convertido este archivo en el más grande y heterogéneo del repo).
// Barrel para que los callers existentes (`import { X } from "@/lib/helpers"`)
// no necesiten cambiar.

export * from "./camara";
export * from "./cierre";
export * from "./clientes";
export * from "./config";
export * from "./contabilidad";
export * from "./cupones";
export * from "./estanques";
export * from "./fechas";
export * from "./funcionario";
export * from "./ids";
export * from "./ingresos";
export * from "./inventario";
export * from "./mail";
export * from "./mantencion";
export * from "./ofertasPlan";
export * from "./oneclick";
export * from "./perfiles";
export * from "./precios";
export * from "./recorrido";
export * from "./servicios";
export * from "./validadores";
export * from "./ventas";
export * from "./whatsapp";
