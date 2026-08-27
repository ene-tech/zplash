import { boolean, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { clientes } from "./clientes";
import { plantillasCorreo } from "./mail";
import { timestamptz } from "./shared";

// Motor de reglas de correo — mismo patrón que reglasWhatsapp/
// disparosReglaWhatsapp (ver @/db/schema/whatsapp y @/lib/whatsapp/reglas),
// pero en paralelo, no compartiendo tabla: WhatsApp exige templates
// pre-aprobados por Meta y tiene su propio modelo de cupón/push-fallback que
// no aplica acá, y correo no depende de ningún catálogo externo aprobado —
// mezclar ambos canales en una tabla forzaría condicionales por canal en
// todo el motor de WhatsApp (crítico, ligado a cobros) solo para reusar unas
// pocas columnas. Reusa sí el mismo catálogo de contenido por canal
// (plantillasCorreo en vez de plantillasWhatsapp) y el mismo patrón de
// idempotencia. Editable desde Web Settings → Reglas Correo.
export const reglasCorreo = pgTable("reglas_correo", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activa: boolean("activa").notNull().default(true),
  // "venta_creada": se evalúa al insertar una Venta nueva (ver
  // evaluarReglasCorreoPorVenta, llamado desde dataAccess/ventas.ts::
  // insertVentas junto a evaluarReglasPorVenta de WhatsApp). "cobro_fallido":
  // se evalúa cuando un cobro Oneclick es rechazado (ver
  // evaluarReglasCorreoPorCobroFallido, llamado desde cobrarSuscripcion junto
  // a evaluarReglasPorCobroFallido). "plan_proximo_vencer" y "plan_vencido":
  // se evalúan en el cron diario (/api/correo/reglas/evaluar) escaneando
  // clientes por vencimiento — ver procesarVencimientosCorreo.
  // "migracion_woo_legacy": no la evalúa ningún hook automático, la dispara a
  // mano un admin desde Web Settings (ver enviarInvitacionesMigracionWoo en
  // @/lib/mailing/migracionWoo) contra clientes con renovacionAutoWooDesde
  // seteado — existe como ReglaCorreo igual que las demás para reusar el
  // mismo catálogo de plantillas y la misma tabla de disparos/idempotencia.
  tipoEvento: text("tipo_evento").notNull(),
  // Solo aplica a tipoEvento="venta_creada": matchea venta.tipo tal cual. Null
  // = cualquier tipo de venta.
  condicionTipoVenta: text("condicion_tipo_venta"),
  // Filtro opcional por plan. Vacío/null = todos.
  condicionPlanes: jsonb("condicion_planes").$type<string[]>(),
  // Solo aplica a tipoEvento="plan_proximo_vencer": cuántos días antes del
  // vencimiento se dispara.
  condicionDiasAntesVencimiento: integer("condicion_dias_antes_vencimiento"),
  // Solo aplica a tipoEvento="plan_proximo_vencer": si true, no dispara para
  // un cliente que ya tiene una suscripción Oneclick "activa" (ver
  // procesarVencimientosCorreo) — a ese cliente el cobro automático ya lo va
  // a renovar solo, avisarle "tu plan vence" es ruido/confunde. El origen no
  // entra en el filtro: la inscripción de tarjeta es por patente (Mi Cuenta →
  // "Mis tarjetas", ver /api/pagos/oneclick/inscribir), así que un cliente
  // origen="LOCAL" también puede tener cobro automático. Sin tarjeta inscrita
  // —local o web— el recordatorio sí le sirve y lo recibe.
  condicionSoloSinAutopago: boolean("condicion_solo_sin_autopago").notNull().default(false),
  // Solo aplica a tipoEvento="plan_proximo_vencer": si true, no dispara para un
  // cliente que no tenga promoción de renovación anticipada vigente por el
  // canal Web (ver tramosRenovacionLocal/precioRenovacionLocal en @/types y
  // @/lib/helpers) — el que ya viene mucho queda fuera del tramo y renovaría
  // al precio normal, así que invitarlo con un correo de "precio preferencial"
  // sería mentirle. Es lo que hace útil a {{precioRenovacion}} en la plantilla:
  // la regla solo se dispara cuando ese precio existe. En false (default) la
  // regla dispara para todos y {{precioRenovacion}} queda vacío para los que
  // no tienen promo, igual que cualquier otra variable sin valor.
  condicionSoloConPromoRenovacion: boolean("condicion_solo_con_promo_renovacion").notNull().default(false),
  // Solo aplica a tipoEvento="plan_vencido": días de espera DESPUÉS del
  // vencimiento antes de mandar (0/null = al día siguiente, ver
  // DIAS_VENTANA_PLAN_VENCIDO en @/lib/mailing/reglas/cron). Permite, por
  // ejemplo, avisar recién a los 3 días de vencido a un cliente al que no se
  // le pudo cobrar automáticamente, dándole tiempo a que el reintento de
  // cobro (si existe) resuelva solo antes de mandarle el correo.
  condicionDiasDespuesVencimiento: integer("condicion_dias_despues_vencimiento"),
  // Solo aplica a tipoEvento="plan_vencido": tope de pasadas del ultimo periodo
  // que el cliente SI pago (visitasUltimoPeriodoVencido) para que la regla le
  // dispare. Null = sin filtro, dispara para todos.
  //
  // Existe porque el correo de reactivacion argumenta con {{pasadas}}: al que
  // pasaba menos veces que las incluidas en el X5 se le puede decir de frente
  // que el plan le cubre su uso y le baja el precio. Al que pasaba mas, ese
  // mismo texto le ofrece MENOS lavados de los que usaba, y conviene dejarlo
  // fuera o mandarle otra plantilla.
  condicionPasadasMax: integer("condicion_pasadas_max"),
  // Solo aplica a tipoEvento="venta_creada": días de espera tras la venta
  // antes de mandar (0 = inmediato) — igual semántica que delayDias en
  // ReglaWhatsapp, pero sin el cron de "pendientes programados" de WhatsApp:
  // en v1 solo se usa 0 (envío inmediato); un delay > 0 queda guardado pero
  // sin cron propio que lo procese todavía.
  delayDias: integer("delay_dias").notNull().default(0),
  plantillaCorreoId: text("plantilla_correo_id")
    .notNull()
    .references(() => plantillasCorreo.id),
  creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  creadoPor: text("creado_por"),
});

// Registro de cada disparo de una ReglaCorreo — auditoría (qué se mandó y
// cuándo) e idempotencia (evita disparar la misma regla dos veces para el
// mismo origen), mismo diseño que disparosReglaWhatsapp. `origenId` es el id
// de la Venta para "venta_creada", el id del cobro (cobrosOneclick.id) para
// "cobro_fallido", `${clienteId}:${vencimientoISO}` para
// "plan_proximo_vencer"/"plan_vencido" (así un plan renovado con un
// vencimiento nuevo vuelve a ser elegible), o el id del cliente para
// "migracion_woo_legacy" (una sola invitación por cliente, no por ciclo). El
// unique (regla_id, origen_tipo, origen_id) es la idempotencia real; `error`
// guarda el motivo cuando estado="error" (sin proveedor configurado, rechazo
// del proveedor de correo, etc.) — a diferencia de WhatsApp, acá no hay una
// tabla "mensajes" aparte donde guardar ese detalle.
export const disparosReglaCorreo = pgTable(
  "disparos_regla_correo",
  {
    id: text("id").primaryKey(),
    reglaId: text("regla_id")
      .notNull()
      .references(() => reglasCorreo.id, { onDelete: "cascade" }),
    origenTipo: text("origen_tipo").notNull(),
    origenId: text("origen_id").notNull(),
    clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    patente: text("patente"),
    estado: text("estado").notNull().default("programado"),
    error: text("error"),
    enviarEn: timestamptz("enviar_en").notNull(),
    creadoEn: timestamptz("creado_en").notNull().defaultNow(),
  },
  (t) => [unique("disparos_regla_correo_regla_origen_unq").on(t.reglaId, t.origenTipo, t.origenId)]
);
