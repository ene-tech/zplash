// Dos reglas de WhatsApp nuevas (oct-2026), complemento del programa de
// referidos (ver crear-template-referidos-lavado-unico.mts):
//
// 1. Clientes de PLAN: la invitación a referir en su primer ingreso del mes
//    (tipo "primer_ingreso_mes": una vez por cliente por mes calendario, no en
//    cada una de sus pasadas). El lavado único ya la recibe por su propia regla.
// 2. Lavado único: la invitación al upgrade a Plan X5, 2 días DESPUÉS del
//    lavado (la del momento es la de referidos). El cron diario recalcula el
//    precio ese día; si ya no califica (contrató, se cerró la ventana de
//    horasVentanaUpgradePlan) no se manda. Excluye pagos con cupón, igual que
//    tenía el upgrade antes.
//
// Ids fijos + on conflict do nothing: correrlo dos veces no duplica reglas.
// Uso: npx tsx --env-file=.env.local scripts/crear-reglas-referidos-oct-2026.mts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const filas = await sql`
    insert into reglas_whatsapp (id, nombre, activa, tipo_evento, condicion_tipo_venta, condicion_excluir_con_cupon, delay_dias, accion, plantilla_whatsapp_id, creado_por)
    values
      ('regla-referidos-plan-mes', 'Plan: invitación Regala y Gana (1ra visita del mes)', true, 'primer_ingreso_mes', null, false, 0,
       'mensaje_simple', 'wa-lavado-unico-referidos', 'script-referidos-oct-2026'),
      ('regla-upgrade-lavado-unico-2d', 'Lavado único: invitación upgrade a Plan X5 (2 días después)', true, 'venta_creada', 'Lavado único', true, 2,
       'mensaje_simple', 'wa-lavado-unico-upgrade-plan', 'script-referidos-oct-2026')
    on conflict (id) do nothing
    returning id, nombre`;
  console.log(filas.length ? filas : "Las reglas ya existían, no se tocó nada.");
} finally {
  await sql.end();
}
