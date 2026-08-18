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
  // Días de vigencia de los tickets del Pack de Tickets (ver TICKETS_KEY en
  // helpers/precios.ts) desde su fecha de compra/generación — editable en Web
  // Settings, a propósito NO amarrado a los 90 días fijos de otros productos.
  vigenciaDiasPackEmpresa: integer("vigencia_dias_pack_empresa").notNull().default(45),
  // Escala de precio de renovación preferencial anticipada (plan vigente) por
  // pasadas del período vigente, keyed por plan (ver
  // TramoRenovacionLocal/precioRenovacionLocal en @/types y @/lib/helpers).
  // `canal` (ausente = "AMBOS" en los tramos guardados antes de que existiera)
  // restringe por dónde se puede tomar ese precio: "WEB" permite invitar a
  // renovar online a un valor que el operador no puede cobrar en el local.
  tramosRenovacionLocal: jsonb("tramos_renovacion_local")
    .$type<
      Record<
        string,
        { id: string; visitasMin: number; visitasMax: number | null; precio: number; canal?: "WEB" | "LOCAL" | "AMBOS" }[]
      >
    >()
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
  // `canal` (ausente = "AMBOS" en los tramos guardados antes de que existiera)
  // restringe por dónde se puede tomar ese precio.
  tramosReactivacionVencido: jsonb("tramos_reactivacion_vencido")
    .$type<
      Record<
        string,
        {
          id: string;
          diasVencidoMin: number;
          diasVencidoMax: number | null;
          visitasMin: number;
          visitasMax: number | null;
          precio: number;
          canal?: "WEB" | "LOCAL" | "AMBOS";
        }[]
      >
    >()
    .notNull()
    .default({}),
  // Horas mínimas entre dos ingresos por plan de un mismo vehículo antes de
  // volver a quedar "libre" (ver estadoReingresoPlan/HORAS_MIN_ENTRE_INGRESOS_PLAN
  // en @/lib/helpers/ingresos). Acepta decimales (ej: 24.5 = 24 horas 30 min).
  // Días de atraso dentro de los cuales un plan vencido se puede pagar como
  // renovación normal: mismo precio de contratación (heredado) y misma fecha
  // de vencimiento que si hubiera pagado a tiempo (ver enPlazoDePagoPlan).
  diasGraciaPagoAtrasado: integer("dias_gracia_pago_atrasado").notNull().default(4),
  horasBloqueoReingresoPlan: numeric("horas_bloqueo_reingreso_plan", { mode: "number" }).notNull().default(24.5),
  // Monto y vigencia del cupón que arma el flujo de registro de primera vez
  // del bot de WhatsApp (Opción 5, ver manejarPasoRegistroDescuento en
  // @/lib/whatsapp/router) — antes constantes fijas
  // DESCUENTO_PRIMERA_VEZ_VALOR/_DIAS_VALIDEZ en @/lib/whatsapp/contenido,
  // ahora autoadministrable desde Web Settings → Menú Bot WhatsApp.
  descuentoPrimeraVezValor: integer("descuento_primera_vez_valor").notNull().default(1000),
  descuentoPrimeraVezDiasValidez: integer("descuento_primera_vez_dias_validez").notNull().default(7),
  // Contenido editable de las respuestas del bot de WhatsApp (ver
  // TextosBotWhatsapp en @/types y TEXTOS_BOT_WHATSAPP_DEFAULT en
  // @/lib/whatsapp/contenido). Se guarda parcial a propósito (default {}):
  // configFromRow rellena con el default cualquier campo no editado, así el
  // texto de fábrica no se duplica acá.
  textosBotWhatsapp: jsonb("textos_bot_whatsapp")
    .$type<Partial<Record<string, string>>>()
    .notNull()
    .default({}),
  // OBSOLETAS: guardaban la URL de la imagen que el bot de WhatsApp adjuntaba
  // en las Opciones 1 y 2. El bot ya no manda imágenes — la Opción 1 responde
  // con la lista de precios en texto, generada desde getPreciosPublicos (ver
  // @/lib/whatsapp/contenido). Ya no las lee ni las escribe nadie: salieron de
  // ConfigGlobal y de configFromRow/configToRow. Se dejan en pie a propósito
  // para no meter un DROP COLUMN encima de la migración 0066 que está en
  // curso; borrarlas es una migración propia y no hay nada que la bloquee.
  imagenPreciosWhatsapp: text("imagen_precios_whatsapp"),
  imagenPlanWhatsapp: text("imagen_plan_whatsapp"),
  // Firma HTML que CorreoRedactarModal antepone al cuerpo de un correo nuevo
  // o respuesta (ver @/types/buzon y @/components/modals/CorreoRedactarModal)
  // — editable en Web Settings, vacío por defecto (no se agrega nada).
  firmaCorreo: text("firma_correo").notNull().default(""),
});
