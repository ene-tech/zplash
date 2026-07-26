import { boolean, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";

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
  // Horas desde el pago de un "Lavado único" dentro de las cuales se puede
  // ofrecer la promoción de upgrade a plan (ver ventaUpgradeElegible).
  horasVentanaUpgradePlan: integer("horas_ventana_upgrade_plan").notNull().default(1),
  // Escala de precio de reactivación preferencial para clientes (Local o
  // Web) con el plan vencido hace poco, keyed por plan — dos rangos por tramo (días
  // vencido y visitas del último período vigente, ver
  // TramoReactivacionVencido/precioReactivacionVencido en @/types y
  // @/lib/helpers). A diferencia de tramosRenovacionLocal, si el cliente no
  // calza en ningún tramo no se ofrece promoción (sin precio de respaldo).
  tramosReactivacionVencido: jsonb("tramos_reactivacion_vencido")
    .$type<
      Record<
        string,
        { id: string; diasVencidoMin: number; diasVencidoMax: number | null; visitasMin: number; visitasMax: number | null; precio: number }[]
      >
    >()
    .notNull()
    .default({}),
  // Horas mínimas entre dos ingresos por plan de un mismo vehículo antes de
  // volver a quedar "libre" (ver estadoReingresoPlan/HORAS_MIN_ENTRE_INGRESOS_PLAN
  // en @/lib/helpers/ingresos). Acepta decimales (ej: 24.5 = 24 horas 30 min).
  horasBloqueoReingresoPlan: numeric("horas_bloqueo_reingreso_plan", { mode: "number" }).notNull().default(24.5),
  // Contenido editable de las respuestas del bot de WhatsApp (ver
  // TextosBotWhatsapp en @/types y TEXTOS_BOT_WHATSAPP_DEFAULT en
  // @/lib/whatsapp/contenido). Se guarda parcial a propósito (default {}):
  // configFromRow rellena con el default cualquier campo no editado, así el
  // texto de fábrica no se duplica acá.
  textosBotWhatsapp: jsonb("textos_bot_whatsapp")
    .$type<Partial<Record<string, string>>>()
    .notNull()
    .default({}),
  // URL pública (Supabase Storage) de la imagen que el bot adjunta en la
  // Opción 1/2 del menú de WhatsApp (ver SERVICIOS_IMAGEN_PATH/PLAN_IMAGEN_PATH
  // en @/lib/whatsapp/contenido) — null/vacío usa el archivo estático de
  // fábrica en vez de uno subido por el admin desde Web Settings.
  imagenPreciosWhatsapp: text("imagen_precios_whatsapp"),
  imagenPlanWhatsapp: text("imagen_plan_whatsapp"),
});
