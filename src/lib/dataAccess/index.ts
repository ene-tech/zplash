import "server-only";

// Capa de acceso a datos "cruda": sin chequeos de sesión/permiso. La usan
// dos tipos de caller, cada uno con su propia forma de autenticarse antes de
// llegar acá:
//   1) Los Server Actions de @/lib/db (capa fina, ver ese archivo), que
//      exigen una sesión de perfil válida antes de delegar acá.
//   2) Rutas server-to-server que no tienen perfil logueado pero ya
//      verificaron al llamante por otro medio (ej. lib/whatsapp/router.ts,
//      protegido por la firma de Twilio en /api/whatsapp).
// Este archivo no lleva "use server": al no tener esa directiva, ninguna de
// estas funciones queda expuesta como endpoint invocable directamente desde
// el navegador, sin importar quién la importe.
//
// Dividido por dominio de negocio (clientes, ventas, inventario, agenda,
// contabilidad, etc.) en vez de mantenerse como un solo archivo — cada
// submódulo exporta su propia API y este barrel la reexporta completa para
// que los callers existentes (`import { X } from "@/lib/dataAccess"` o
// `import * as dataAccess from "@/lib/dataAccess"`) no necesiten cambiar.

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
