import { bigserial, boolean, integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Refleja supabase/schema.sql (documentación del DDL). Desde la adopción de
// drizzle-kit (ver supabase/adopt-drizzle-migrations.sql), los cambios de
// esquema se hacen acá y se generan/aplican con "npm run db:generate" +
// "npm run db:migrate" — ya no a mano en el SQL Editor de Supabase.

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
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  fecha: timestamptz("fecha").notNull().defaultNow(),
  planEstadoAlIngreso: text("plan_estado_al_ingreso").notNull(),
  creadoPor: text("creado_por"),
  esGarantia: boolean("es_garantia").notNull().default(false),
  viaCupon: boolean("via_cupon").notNull().default(false),
  cuponCodigo: text("cupon_codigo").references(() => cupones.codigo, { onDelete: "set null" }),
  glosa: text("glosa"),
  citaId: text("cita_id").references(() => citas.id, { onDelete: "set null" }),
});

export const ventas = pgTable("ventas", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
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
  fechaEntrega: text("fecha_entrega"),
  citaId: text("cita_id").references(() => citas.id, { onDelete: "set null" }),
  cantidadItems: integer("cantidad_items").notNull().default(1),
  notas: text("notas"),
  estadoPago: text("estado_pago"),
  montoCobrado: numeric("monto_cobrado", { mode: "number" }),
  esServicioAdicional: boolean("es_servicio_adicional").notNull().default(false),
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  // Email de quien compró (hoy solo se llena en Pack Empresa por web, ver
  // pagosWebpayItems.email) — permite mostrarle esta venta en Mi Cuenta
  // buscando por el correo de la sesión.
  email: text("email"),
  viaCupon: boolean("via_cupon").notNull().default(false),
  cuponCodigo: text("cupon_codigo").references(() => cupones.codigo, { onDelete: "set null" }),
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
  // Se incrementa cada vez que cambia `clave` (ver /api/perfiles/cambiar-clave)
  // y viaja dentro del payload firmado de la cookie de sesión (@/lib/session).
  // Así, cambiar la contraseña invalida cualquier sesión ya emitida con la
  // versión anterior, aunque falten horas para que expire por sí sola.
  claveVersion: integer("clave_version").notNull().default(1),
  modulos: jsonb("modulos").$type<string[]>().notNull().default([]),
  icono: text("icono"),
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
  // RUT de la empresa dueña del lote (packs empresa comprados por web o
  // generados manualmente en B2B/Tickets con Factura) — permite la consulta
  // pública de tickets por RUT en /api/empresa/tickets. Null en cupones que
  // no pertenecen a una empresa (ej. descuentos individuales del bot).
  rut: text("rut"),
  // Solo aplica a tipo "vale" de un pack empresa: lista de patentes de la
  // flota autorizadas a canjear cualquiera de los tickets del lote. Null o
  // vacío = lote abierto, cualquier patente puede canjear (comportamiento
  // original de "vale").
  patentesAutorizadas: jsonb("patentes_autorizadas").$type<string[]>(),
  // Email de quien compró el Pack Empresa por web — permite mostrar los
  // tickets en Mi Cuenta (portal cliente) buscando por el correo de la
  // sesión, sin depender de que el comprador recuerde el RUT. Null en
  // cupones que no vienen de una compra web con email (generados a mano en
  // B2B/Tickets/Dsctos, o descuentos individuales del bot).
  email: text("email"),
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

// Línea individual importada de una cartola bancaria (hoy solo Santander
// Empresa, vía PDF de "Cartolas históricas" de Office Banking — ver
// @/lib/cartolaParser). `movimientoContableId` liga esta línea a un
// movimiento ya registrado en la app cuando el usuario confirma el vínculo
// manualmente (ver ConciliacionBancariaTab); nunca se linkea solo.
export const cartolaMovimientos = pgTable("cartola_movimientos", {
  id: text("id").primaryKey(),
  cuenta: text("cuenta").notNull().default("santander_empresa"),
  fecha: timestamptz("fecha").notNull(),
  glosa: text("glosa").notNull(),
  cargo: numeric("cargo", { mode: "number" }).notNull().default(0),
  abono: numeric("abono", { mode: "number" }).notNull().default(0),
  saldo: numeric("saldo", { mode: "number" }),
  numeroDocumento: text("numero_documento"),
  sucursal: text("sucursal"),
  // Etiqueta libre (ej. "Ingreso Tarjeta POS (GETNET)"), asignada por una
  // regla de @/lib/db#reglasConciliacion o a mano en la UI. Taxonomía propia,
  // sin relación con `movimientosContables.categoria` (esa sigue el EERR).
  categoria: text("categoria"),
  estado: text("estado").notNull().default("pendiente"), // pendiente | conciliado | ignorado
  movimientoContableId: text("movimiento_contable_id").references(() => movimientosContables.id, { onDelete: "set null" }),
  notas: text("notas"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Reglas "aprendidas" para clasificar automáticamente futuras líneas de
// cartola: si la glosa contiene `id` (case-insensitive), se le asigna
// `categoria` al importar (ver importarCartola en @/lib/actions). `id` es el
// propio patrón (mismo criterio que `precios.plan`) para que enseñar una
// regla nueva sea un upsert simple, sin necesitar una columna unique aparte.
export const reglasConciliacion = pgTable("reglas_conciliacion", {
  id: text("id").primaryKey(),
  categoria: text("categoria").notNull(),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

export const categoriasGasto = pgTable("categorias_gasto", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  grupo: text("grupo").notNull(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Canal seleccionable en el formulario de Ingresos (ver CategoriaIngreso en
// @/types) — sin "grupo": a diferencia de categorias_gasto, no está atada a
// la estructura fija del EERR.
export const categoriasIngreso = pgTable("categorias_ingreso", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  activa: boolean("activa").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Tabla "singleton" (una sola fila, id siempre true) para configuración global.
// horario_operador_*: bloqueo horario del módulo Operador (ver
// ConfigGlobal/dentroDeHorarioOperador) — fuera de este rango, un perfil sin
// acceso a Configuración no puede registrar el ingreso de un vehículo.
// festivos: fechas YYYY-MM-DD que usan el horario de fin de semana.
export const config = pgTable("config", {
  id: boolean("id").primaryKey().default(true),
  pinAdmin: text("pin_admin").notNull().default("1234"),
  horarioOperadorSemanaInicio: text("horario_operador_semana_inicio").notNull().default("08:25"),
  horarioOperadorSemanaFin: text("horario_operador_semana_fin").notNull().default("20:15"),
  horarioOperadorFindeInicio: text("horario_operador_finde_inicio").notNull().default("09:55"),
  horarioOperadorFindeFin: text("horario_operador_finde_fin").notNull().default("19:15"),
  festivos: jsonb("festivos").$type<string[]>().notNull().default([]),
  // Días de vigencia de los tickets de un Pack Empresa (ver PACKS_EMPRESA en
  // helpers.ts) desde su fecha de compra/generación — editable en Web
  // Settings, a propósito NO amarrado a los 90 días fijos de otros productos.
  vigenciaDiasPackEmpresa: integer("vigencia_dias_pack_empresa").notNull().default(365),
  // Escala de precio de renovación preferencial por visitas para clientes
  // Local, keyed por plan (ver TramoRenovacionLocal/precioRenovacionLocal en
  // @/types y @/lib/helpers).
  tramosRenovacionLocal: jsonb("tramos_renovacion_local")
    .$type<Record<string, { id: string; visitasMin: number; visitasMax: number | null; precio: number }[]>>()
    .notNull()
    .default({}),
});

// Catálogo de servicios (fusiona el antiguo listado hardcodeado
// SERVICIOS_ADICIONALES): lo usa tanto ServiciosAdicionalesView (venta rápida
// en el POS) como la Agenda (duracionMinutos define el largo del cupo, igual
// que `procedimientos` en ConsultaPro). El precio NO vive acá — sigue en la
// tabla `precios` genérica, keyed por servicios.id, igual que hoy.
export const servicios = pgTable("servicios", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  categoria: text("categoria"),
  duracionMinutos: integer("duracion_minutos").notNull().default(30),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Horario semanal recurrente único para todo el negocio: a diferencia de
// ConsultaPro (horario por profesional), acá no hay "profesional" al que
// asignarle una cita — un lavadero atiende con capacidad de 1 cupo por
// horario. diaSemana: 0=domingo … 6=sábado.
export const horariosAgenda = pgTable("horarios_agenda", {
  id: text("id").primaryKey(),
  diaSemana: integer("dia_semana").notNull(),
  horaInicio: text("hora_inicio").notNull(),
  horaFin: text("hora_fin").notNull(),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Excepciones puntuales al horario habitual: un día completo bloqueado o un
// rango de horas específico dentro de un día.
export const bloqueosAgenda = pgTable("bloqueos_agenda", {
  id: text("id").primaryKey(),
  fecha: text("fecha").notNull(),
  todoElDia: boolean("todo_el_dia").notNull().default(true),
  horaInicio: text("hora_inicio"),
  horaFin: text("hora_fin"),
  motivo: text("motivo"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Cita agendada desde el Registro de Servicio Adicional. duracionMinutos es
// la suma de los servicios ligados en `cita_servicios` (ver esa tabla) —
// snapshot al momento de agendar, así que si luego cambia la duración del
// catálogo la cita ya creada no se recalcula sola. La cita NO genera
// automáticamente una Venta/Ingreso: eso sigue siendo el mismo registro que
// ya hace ServiciosAdicionalesView al guardar.
export const citas = pgTable("citas", {
  id: text("id").primaryKey(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
  patente: text("patente").notNull(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  fechaHora: timestamptz("fecha_hora").notNull(),
  duracionMinutos: integer("duracion_minutos").notNull(),
  estado: text("estado").notNull().default("agendado"),
  notas: text("notas"),
  origen: text("origen").notNull().default("interno"),
  creadoPor: text("creado_por"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Servicios ligados a una cita (equivalente a cita_procedimientos en
// ConsultaPro): una cita puede incluir varios servicios del catálogo a la
// vez (ej. Lavado Detailing + Limpieza de Tapiz), en vez de guardar los
// nombres concatenados en un string. onDelete cascade en servicioId sigue el
// mismo criterio que ConsultaPro: los servicios del catálogo casi nunca se
// borran de verdad (se desactivan con `activo`), así que perder el vínculo
// histórico si alguna vez se borra un servicio es un caso aceptado.
export const citaServicios = pgTable("cita_servicios", {
  id: text("id").primaryKey(),
  citaId: text("cita_id")
    .notNull()
    .references(() => citas.id, { onDelete: "cascade" }),
  servicioId: text("servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "cascade" }),
});

// Ciclo de vida de una transacción Webpay Plus iniciada desde /pagar. A
// diferencia del webhook de WooCommerce (que solo sincroniza pedidos que un
// tercero ya cobró), acá ZPlash es quien habla directo con Transbank: no se
// debe crear una fila en `ventas` hasta que Transaction.commit() confirme el
// pago (response_code === 0) en /api/pagos/webpay/retorno.
export const pagosWebpay = pgTable("pagos_webpay", {
  buyOrder: text("buy_order").primaryKey(), // máx 26 caracteres (límite Transbank)
  sessionId: text("session_id").notNull(),
  patente: text("patente").notNull(),
  // "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" si la compra
  // tenía un solo ítem (se sigue llenando igual que antes, por legibilidad);
  // "carrito" si tenía 2+ ítems — ver desglose en `pagosWebpayItems`.
  tipo: text("tipo").notNull(),
  servicioId: text("servicio_id"), // solo si tipo = "servicio" y la compra tenía un solo ítem
  monto: numeric("monto", { mode: "number" }).notNull(), // monto total cobrado a Transbank (suma de todos los ítems)
  estado: text("estado").notNull().default("iniciada"), // iniciada|aprobada|rechazada|anulada
  token: text("token"),
  authorizationCode: text("authorization_code"),
  responseCode: integer("response_code"),
  // Siempre null desde que existe `pagosWebpayItems`: la venta asociada a
  // cada ítem se registra en `pagosWebpayItems.ventaId`, no acá, para no
  // tener dos fuentes de verdad cuando una compra tiene varios ítems.
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamptz("actualizado_en"),
});

// Desglose por ítem de una transacción Webpay: Transbank solo permite cobrar
// un monto único por buy_order, así que un carrito con varios ítems se cobra
// como una sola transacción (`pagosWebpay.monto` = suma) y acá queda el
// detalle para poder aplicar el efecto de cada ítem por separado en
// /api/pagos/webpay/retorno (extender plan, crear una venta por ítem, etc).
export const pagosWebpayItems = pgTable("pagos_webpay_items", {
  id: text("id").primaryKey(), // `${buyOrder}-${index}`
  buyOrder: text("buy_order")
    .notNull()
    .references(() => pagosWebpay.buyOrder, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // "plan_nuevo" | "renovacion" | "servicio" | "lavado_unico" | "pack_empresa"
  servicioId: text("servicio_id"), // solo si tipo = "servicio"
  nombre: text("nombre").notNull(), // snapshot del nombre al momento del cobro
  monto: numeric("monto", { mode: "number" }).notNull(),
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  // Columnas usadas solo cuando tipo = "pack_empresa": llevan el dato de
  // facturación/flota ingresado en el checkout a través del viaje de ida y
  // vuelta a Transbank, hasta que /api/pagos/webpay/retorno los aplica (ver
  // aplicarPagoPackEmpresa en @/lib/pagos).
  tipoDocumento: text("tipo_documento"),
  razonSocial: text("razon_social"),
  rut: text("rut"),
  direccion: text("direccion"),
  giro: text("giro"),
  // Email de quien compró — llega desde el checkout, viaja hasta acá igual
  // que el resto de estos campos, y aplicarPagoPackEmpresa lo copia a los
  // cupones/venta resultantes para poder mostrarlos en Mi Cuenta.
  email: text("email"),
  cantidadCupones: integer("cantidad_cupones"),
  patentesAutorizadas: jsonb("patentes_autorizadas").$type<string[]>(),
  // Nombre de lote que el propio cliente le pone a su compra (ej. "Lavados
  // rentacar SALFA Mayo") para reconocerlo después en Mi Cuenta y en el
  // panel B2B/Tickets/Dsctos — si lo deja vacío, aplicarPagoPackEmpresa cae
  // a razonSocial o "Pack Empresa Web" (mismo fallback de siempre).
  nombreLote: text("nombre_lote"),
});

// Tarjeta inscrita en Oneclick Mall para renovación automática mensual. Una
// sola fila por patente (username exigido por Transbank, usamos la patente
// normalizada). tokenInscripcion solo se usa mientras está "pendiente"
// (correlaciona el callback de MallInscription.finish con esta fila).
export const suscripcionesOneclick = pgTable("suscripciones_oneclick", {
  id: text("id").primaryKey(),
  patente: text("patente").notNull(),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  tokenInscripcion: text("token_inscripcion"),
  tbkUser: text("tbk_user"),
  cardTipo: text("card_tipo"),
  cardUltimosDigitos: text("card_ultimos_digitos"),
  estado: text("estado").notNull().default("pendiente"), // pendiente|activa|suspendida|cancelada
  proximoCobro: timestamptz("proximo_cobro"),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamptz("actualizado_en"),
});

// Cada intento de cobro mensual (automático vía cron, primer cobro tras
// inscribir, o manual desde ClienteInfoModal) contra una suscripción activa.
// A propósito NO hay unique(suscripcionId, cicloYm): un ciclo puede tener
// varias filas "rechazada" (reintentos), pero cobrarSuscripcion() en
// @/lib/pagos revisa antes de cobrar que no exista ya una "aprobada" para
// ese ciclo, para no cobrar dos veces un mismo mes.
export const cobrosOneclick = pgTable("cobros_oneclick", {
  id: text("id").primaryKey(), // buyOrder: se usa como parent y child buy_order
  suscripcionId: text("suscripcion_id")
    .notNull()
    .references(() => suscripcionesOneclick.id, { onDelete: "cascade" }),
  cicloYm: text("ciclo_ym").notNull(), // "YYYY-MM"
  monto: numeric("monto", { mode: "number" }).notNull(),
  estado: text("estado").notNull(), // aprobada|rechazada
  responseCode: integer("response_code"),
  authorizationCode: text("authorization_code"),
  ventaId: text("venta_id").references(() => ventas.id, { onDelete: "set null" }),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
});

// Log de auditoría: quién modificó qué fila y cuándo, para las tablas que
// mueven dinero o datos de clientes (clientes/ingresos/ventas/empresas/
// cupones/movimientos_contables/citas). Se escribe a nivel de aplicación (ver
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
