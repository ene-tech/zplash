// Refleja supabase/schema.sql (documentación del DDL). Desde la adopción de
// drizzle-kit (ver supabase/adopt-drizzle-migrations.sql), los cambios de
// esquema se hacen acá y se generan/aplican con "npm run db:generate" +
// "npm run db:migrate" — ya no a mano en el SQL Editor de Supabase.
//
// Dividido por dominio de negocio, en paralelo a @/lib/dataAccess — el orden
// de los exports respeta las referencias entre tablas (una tabla con FK a
// otra importa esa otra desde su propio módulo; ver por ejemplo ingresos.ts
// importando `citas` de agenda.ts) para que no haya ciclos de import entre
// archivos. `getDb()` (ver @/db) sigue haciendo `import * as schema from
// "./schema"`, así que este barrel debe reexportar cada tabla para que
// drizzle() reciba el mismo objeto de esquema completo que antes.

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
export * from "./mail";
export * from "./mantencion";
export * from "./otpCliente";
export * from "./pagos";
export * from "./perfiles";
export * from "./precios";
export * from "./pushSubscriptions";
export * from "./servicios";
export * from "./ventas";
export * from "./whatsapp";
