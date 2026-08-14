// Motor de reglas de correo, dividido por responsabilidad — mismo diseño que
// @/lib/whatsapp/reglas (ver comentario ahí):
//   - motor.ts: ejecuta una regla ya disparada contra un cliente (variables,
//     envío) — usado por disparadores.ts y cron.ts.
//   - disparadores.ts: entra desde eventos de negocio (venta creada, cobro
//     fallido) y decide si corresponde disparar cada regla.
//   - cron.ts: el barrido diario (/api/correo/reglas/evaluar) que evalúa
//     "plan_proximo_vencer" y "plan_vencido".
export * from "./motor";
export * from "./disparadores";
export * from "./cron";
