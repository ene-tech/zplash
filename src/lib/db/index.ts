// Capa fina de Server Actions: cada función exportada de los submódulos de
// este barrel queda expuesta como un endpoint invocable por POST directo,
// sin pasar por la UI (ver node_modules/next/dist/docs/.../mutating-data.md,
// "Server Functions are reachable via direct POST requests"). Por eso cada
// una empieza verificando la sesión antes de tocar datos; la lógica real de
// acceso a datos vive en @/lib/dataAccess, que no tiene directiva de Server
// Actions y por lo tanto no es invocable desde el navegador.
//
// Dividido por dominio de negocio, en paralelo a @/lib/dataAccess — cada
// submódulo trae su propio `"use server"` (es un directive de archivo
// completo: "mark all exports of that file", ver Mutating Data en los docs
// de Next.js) y solo exporta funciones async, como exige esa directiva. Este
// archivo es un barrel de puro re-export (sin declaraciones propias), así
// que no necesita el directive él mismo — reexporta todo para que los
// callers existentes (`import { X } from "@/lib/db"`) no necesiten cambiar.

export * from "./agenda";
export * from "./auditoria";
export * from "./clientes";
export * from "./config";
export * from "./contabilidad";
export * from "./cupones";
export * from "./empresas";
export * from "./ingresos";
export * from "./inventario/destinos";
export * from "./inventario/insumos";
export * from "./inventario/productos";
export * from "./inventario/proveedores";
export * from "./loadAll";
export * from "./oneclick";
export * from "./perfiles";
export * from "./precios";
export * from "./servicios";
export * from "./storage";
export * from "./ventas";
