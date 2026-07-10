import { boolean, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Refleja supabase/schema.sql (fuente de verdad del DDL). Este archivo solo
// existe para que Drizzle tipe las queries — no gestiona migraciones; el
// DDL se sigue aplicando a mano en el SQL Editor de Supabase.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  patente: text("patente").notNull().unique(),
  telefono: text("telefono"),
  email: text("email"),
  vehiculo: text("vehiculo"),
  plan: text("plan"),
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  vencimiento: timestamptz("vencimiento"),
  fechaContratacion: timestamptz("fecha_contratacion"),
  origen: text("origen").notNull().default("LOCAL"),
  visitas: integer("visitas").notNull().default(0),
  ultimaVisita: timestamptz("ultima_visita"),
  ultimaRenovacion: timestamptz("ultima_renovacion"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Empresas de compra y venta para emitir/recibir facturas. contacto_cliente_id
// es informativo (sin foreign key estricta), mismo criterio que
// ingresos/ventas.cliente_id: contacto_nombre queda denormalizado por si el
// cliente referenciado se elimina después.
export const empresas = pgTable("empresas", {
  id: text("id").primaryKey(),
  razonSocial: text("razon_social").notNull(),
  rut: text("rut").notNull().unique(),
  giro: text("giro"),
  direccion: text("direccion"),
  telefono: text("telefono"),
  contactoClienteId: text("contacto_cliente_id"),
  contactoNombre: text("contacto_nombre"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

export const ingresos = pgTable("ingresos", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id"),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  planEstadoAlIngreso: text("plan_estado_al_ingreso").notNull(),
  operador: text("operador"),
  esGarantia: boolean("es_garantia").notNull().default(false),
  viaCupon: boolean("via_cupon").notNull().default(false),
  cuponCodigo: text("cupon_codigo"),
});

export const ventas = pgTable("ventas", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id"),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  plan: text("plan").notNull().default(""),
  precio: numeric("precio", { mode: "number" }).notNull().default(0),
  tipo: text("tipo").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  operador: text("operador"),
  metodoPago: text("metodo_pago"),
  voucher: text("voucher"),
  horaEntrega: text("hora_entrega"),
  notas: text("notas"),
  estadoPago: text("estado_pago"),
  montoCobrado: numeric("monto_cobrado", { mode: "number" }),
  esServicioAdicional: boolean("es_servicio_adicional").notNull().default(false),
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
});

// Reemplaza a las antiguas tablas `operadores` y `administradores` (ver
// supabase/migrar-perfiles.sql): un solo perfil por persona, con la clave
// y la lista de módulos a los que tiene acceso. Incluye "clave": solo se
// consulta desde código server-side de /api/perfiles/* (ver PerfilPublico
// en @/types para la forma pública, sin clave, que sí llega al cliente).
export const perfiles = pgTable("perfiles", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  clave: text("clave").notNull(),
  modulos: jsonb("modulos").$type<string[]>().notNull().default([]),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

export const precios = pgTable("precios", {
  plan: text("plan").primaryKey(),
  normal: numeric("normal", { mode: "number" }).notNull().default(0),
  promo: numeric("promo", { mode: "number" }).notNull().default(0),
});

export const cupones = pgTable("cupones", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombreLote: text("nombre_lote").notNull(),
  valor: numeric("valor", { mode: "number" }).notNull().default(0),
  numeroLote: integer("numero_lote").notNull().default(1),
  totalLote: integer("total_lote").notNull().default(1),
  fechaCaducidad: timestamptz("fecha_caducidad").notNull(),
  usado: boolean("usado").notNull().default(false),
  patenteUso: text("patente_uso"),
  fechaUso: timestamptz("fecha_uso"),
  operadorUso: text("operador_uso"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

export const movimientosContables = pgTable("movimientos_contables", {
  id: text("id").primaryKey(),
  tipo: text("tipo").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  descripcion: text("descripcion").notNull(),
  categoria: text("categoria"),
  contraparte: text("contraparte"),
  rutProveedor: text("rut_proveedor"),
  numeroFactura: text("numero_factura"),
  tipoDocumento: text("tipo_documento"),
  documentoUrl: text("documento_url"),
  documentoNombre: text("documento_nombre"),
  monto: numeric("monto", { mode: "number" }).notNull().default(0),
  estado: text("estado").notNull().default("pendiente"),
  notas: text("notas"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

export const categoriasGasto = pgTable("categorias_gasto", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  grupo: text("grupo").notNull(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Tabla "singleton" (una sola fila, id siempre true) para configuración global.
export const config = pgTable("config", {
  id: boolean("id").primaryKey().default(true),
  pinAdmin: text("pin_admin").notNull().default("1234"),
});
