import { bigserial, boolean, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
// referencia a clientes.id con ON DELETE SET NULL: si el cliente contacto se
// elimina, la empresa queda desvinculada pero no se borra; contacto_nombre
// queda denormalizado igual para no perder el dato en pantalla.
export const empresas = pgTable("empresas", {
  id: text("id").primaryKey(),
  razonSocial: text("razon_social").notNull(),
  rut: text("rut").notNull().unique(),
  giro: text("giro"),
  direccion: text("direccion"),
  telefono: text("telefono"),
  contactoClienteId: text("contacto_cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  contactoNombre: text("contacto_nombre"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

export const ingresos = pgTable("ingresos", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  planEstadoAlIngreso: text("plan_estado_al_ingreso").notNull(),
  creadoPor: text("creado_por"),
  esGarantia: boolean("es_garantia").notNull().default(false),
  viaCupon: boolean("via_cupon").notNull().default(false),
  cuponCodigo: text("cupon_codigo").references(() => cupones.codigo, { onDelete: "set null" }),
  glosa: text("glosa"),
});

export const ventas = pgTable("ventas", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  plan: text("plan").notNull().default(""),
  precio: numeric("precio", { mode: "number" }).notNull().default(0),
  tipo: text("tipo").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  creadoPor: text("creado_por"),
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
  viaCupon: boolean("via_cupon").notNull().default(false),
  cuponCodigo: text("cupon_codigo").references(() => cupones.codigo, { onDelete: "set null" }),
});

// Reemplaza a las antiguas tablas `operadores` y `administradores` (ver
// supabase/migrar-perfiles.sql): un solo perfil por persona, con la clave
// y la lista de módulos a los que tiene acceso. Incluye "clave": solo se
// consulta desde código server-side de /api/perfiles/* (ver PerfilPublico
// en @/types para la forma pública, sin clave, que sí llega al cliente).
// rut/cargo/fechaIngreso/sueldoBase son la ficha de Remuneraciones (ver
// ColaboradorFicha en @/types): igual que "clave", quedan fuera de
// PerfilPublicoRow/loadAll() en su query liviana para el selector de login;
// se cargan aparte con la query más ancha que arma ColaboradorFicha.
export const perfiles = pgTable("perfiles", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  clave: text("clave").notNull(),
  modulos: jsonb("modulos").$type<string[]>().notNull().default([]),
  icono: text("icono"),
  rut: text("rut"),
  cargo: text("cargo"),
  fechaIngreso: timestamptz("fecha_ingreso"),
  sueldoBase: numeric("sueldo_base", { mode: "number" }),
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
  // "vale" (comportamiento original: lavado 100% gratis al canjear) vs
  // "descuento" (resta `valor` del precio a cobrar; ver bot de WhatsApp).
  tipo: text("tipo").notNull().default("vale"),
  // Patente a la que se le asignó el cupón *antes* de usarse (distinto de
  // patenteUso, que se llena recién al canjear). Solo aplica a "descuento".
  patenteAsignada: text("patente_asignada"),
  // Solo aplica a "descuento": true = `valor` es un % (0-100), false = monto fijo en CLP.
  esPorcentaje: boolean("es_porcentaje").notNull().default(false),
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
  metodoPago: text("metodo_pago"),
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

// Liquidaciones de sueldo, una fila por período pagado a un colaborador (ver
// RemuneracionesTab). perfilId referencia a perfiles.id — si el perfil se
// elimina, se borran sus liquidaciones (no tiene sentido conservarlas
// huérfanas, a diferencia de clienteId en ingresos/ventas que sí se
// denormaliza con nombre/patente para no perder el historial visible).
export const liquidacionesSueldo = pgTable("liquidaciones_sueldo", {
  id: text("id").primaryKey(),
  perfilId: text("perfil_id")
    .notNull()
    .references(() => perfiles.id, { onDelete: "cascade" }),
  periodo: text("periodo").notNull(), // "YYYY-MM"
  sueldoBase: numeric("sueldo_base", { mode: "number" }).notNull().default(0),
  gratificacion: numeric("gratificacion", { mode: "number" }).notNull().default(0),
  bonos: numeric("bonos", { mode: "number" }).notNull().default(0),
  horasExtra: numeric("horas_extra", { mode: "number" }).notNull().default(0),
  descuentoAfp: numeric("descuento_afp", { mode: "number" }).notNull().default(0),
  descuentoSalud: numeric("descuento_salud", { mode: "number" }).notNull().default(0),
  descuentoImpuesto: numeric("descuento_impuesto", { mode: "number" }).notNull().default(0),
  otrosDescuentos: numeric("otros_descuentos", { mode: "number" }).notNull().default(0),
  totalLiquido: numeric("total_liquido", { mode: "number" }).notNull().default(0),
  fechaPago: timestamptz("fecha_pago").notNull(),
  documentoUrl: text("documento_url"),
  documentoNombre: text("documento_nombre"),
  notas: text("notas"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Tabla "singleton" (una sola fila, id siempre true) para configuración global.
export const config = pgTable("config", {
  id: boolean("id").primaryKey().default(true),
  pinAdmin: text("pin_admin").notNull().default("1234"),
});

// Log de auditoría: quién modificó qué fila y cuándo, para las tablas que
// mueven dinero o datos de clientes (clientes/ingresos/ventas/empresas/
// cupones/movimientos_contables). Se escribe a nivel de aplicación (ver
// commit() en AppContext.tsx), no con triggers: esta app no usa Supabase
// Auth/RLS, toda la escritura pasa por una sola conexión server-side
// (DATABASE_URL) que no sabe qué perfil está logueado a nivel de DB. Por eso
// NO captura ediciones manuales hechas directo en el SQL Editor de Supabase.
export const auditoria = pgTable("auditoria", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tabla: text("tabla").notNull(),
  registroId: text("registro_id").notNull(),
  accion: text("accion").notNull(),
  datosAnteriores: jsonb("datos_anteriores"),
  datosNuevos: jsonb("datos_nuevos"),
  usuario: text("usuario"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});
